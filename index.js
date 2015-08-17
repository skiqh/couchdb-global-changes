var EventEmitter = require('events').EventEmitter
var EventEmitter2 = require('eventemitter2').EventEmitter2

var request = require('request').defaults({json:true})
var debounce = require('debounce')
var follow = require('follow')
var fs = require('fs')

module.exports = function(opts) {

	if(typeof opts == 'string')
		opts = { couch: opts }
	
	opts = opts || {}

	if(!opts.couch)
		opts.couch = 'http://127.0.0.1:5984'
	if(opts.include)
		opts.include = new RegExp(opts.include)
	if(opts.exclude)
		opts.exclude = new RegExp(opts.exclude)

	opts.couch = opts.couch.replace(/\/*$/, '/')

	var persistence_layer
	if(opts.persist) {
		if(!opts.namespace)
			throw new Error("missing option [namespace]")
		if(typeof opts.persist == 'string' && opts.persist.match(/\.json$/))
			persistence_layer = require('./persist_jsonfile.js')(opts)
		else if(typeof opts.persist == 'string' && opts.persist == '_local')
			persistence_layer = require('./persist_local.js')(opts)
	}
	// var pool = new EventEmitter()
	var pool = new EventEmitter2({wildcard: true})
	pool.namespace = opts.namespace
	

	// this is where we keep the references to the feeds
	var all_feeds = {}

	// helper funtion: count the entries in the all_feeds object
	pool.total_dbs = function() {
		return Object.keys(all_feeds).length
	}
	// helper function: count all feeds that have caught up
	pool.caught_up_dbs = function() {
		return Object.keys(all_feeds).filter(function(db_name) { return all_feeds[db_name].caught_up }).length
	}

	var _remove = function(db_name) {
		if(!(db_name in all_feeds)) {
			pool.emit('warning', "[_remove] not following feed for db " + db_name)
		} else {
			var feed = all_feeds[db_name]
			// stopping the feed will result in the 'stop' event below being emitted
			feed.stop()
		}
	}
	var _add = function(db_name, feed_options) {
		
		if(opts.include && !opts.include.test(db_name))
			return pool.emit('debug', '[_add] ' + db_name + ' does not match include filter')
		if(opts.exclude && opts.exclude.test(db_name))
			return pool.emit('debug', '[_add] ' + db_name + ' does matches exclude filter')
			
		if(db_name in all_feeds)
			return pool.emit('warning', "[_add] already following feed for db " + db_name)
		
		// if the second argument is empty, we have been called directly
		// if it is not, this is the callback of the query to the persistence layer
		if(!feed_options) {
			feed_options = { db: opts.couch + db_name }

			if(persistence_layer)
				return persistence_layer.get(db_name, {}, function(err, res) {
					if(!err && res && res.hasOwnProperty('seq'))
						feed_options.since = res.seq
					_add(db_name, feed_options)
				})
		}

		// we may need to overwrite the feed_options.since parameter 
		// from the persistence layer with the options object
		if((opts.since || opts.since == 0) && (opts.since == 'now' || !isNaN(opts.since)))
			feed_options.since = opts.since
		else if(opts.since && opts.since.hasOwnProperty(db_name))
			feed_options.since = opts.since[db_name]


		if(typeof opts.include_docs !== 'undefined' && (opts.include_docs === true || opts.include_docs === false) )
			feed_options.include_docs = opts.include_docs
		else if(opts.include_docs && opts.include_docs.hasOwnProperty(db_name))
			feed_options.include_docs = opts.include_docs[db_name]
		else
			feed_options.include_docs = false

		// instantiate the feed
		var feed = follow(feed_options)

		// pause the feed so we can emit confirm and start events
		if(feed.pending && feed.pending.request && feed.pending.request.pause)
			feed.pause()

		// debounce writing the sequence id
		// so that this:
		// persist_seq(1000); persist_seq(1050)
		// will be executed only as persist_seq(1050)
		var persist_seq
		var _persist_seq = function(seq_id) {
			persistence_layer.set(db_name, {seq:seq_id, timestamp: (new Date()).toJSON() }, function() {
				pool.emit('db-persist', {db_name:db_name, seq:seq_id})
			})
		}
		// invoke the function only if there is a persistence layer at all
		if(persistence_layer)
			persist_seq = debounce(_persist_seq, opts['persist_debounce'] || opts['persist-debounce'] || 200)
		else
			persist_seq = function() {}



		var _catchup = function(seq_id) {
			persist_seq(seq_id)
			pool.emit('db-catchup', {db_name:db_name, catchup:seq_id, seq:seq_id})

			if(pool.caught_up_dbs() == pool.total_dbs())
				pool.emit('catchup')

		}

		// iriscouch's follow does not keep a reference to the db object
		// so we have to keep it ourselves
		var db_obj
		feed.on('confirm', function(confirm_db_obj) {
			db_obj = confirm_db_obj
			pool.emit('db-confirm', {db_name:db_name, confirm:confirm_db_obj})
			// now begin the actual feed
			if(feed.pending && feed.pending.request && feed.pending.request.resume)
				feed.resume()
			if(confirm_db_obj.doc_count == 0) {
				// if there are no documents in the db,
				// the 'catchup' event will not be fired by 
				// the follow lib, so fake it here
				feed.caught_up = true
				_catchup(0)
			}
		})

		feed.on('change', function(change) { 
			// emit *the* global change event
			pool.emit('db-change', {db_name:db_name, change:change})

			// emit progress events only during the catchup phase
			if(!feed.caught_up) {
				// calculate some progress ratios
				var docs_ratio = parseInt(100*change.seq/db_obj.update_seq)/100
				var db_ratio = pool.caught_up_dbs()/pool.total_dbs()
				var sub_ratio = docs_ratio/pool.total_dbs()

				// and emit them
				pool.emit('db-progress', {db_name:db_name, progress: docs_ratio })
				pool.emit('progress', {progress: db_ratio+sub_ratio, caught_up_dbs:pool.caught_up_dbs(), total_dbs:pool.total_dbs()})
			} else {
				persist_seq(change.seq)
			}

		})

		feed.on('stop', function() { 
			// remove the reference to the feed
			delete all_feeds[db_name]
			// emit the according event
			pool.emit('db-removed', {db_name:db_name})
		})
		feed.on('catchup', _catchup)

		// pass on all other feed events
		feed.on('start', function() {
			pool.emit('db-start', {db_name:db_name})
		})
		feed.on('error', function(error) { 
			pool.emit('db-error', {db_name:db_name, error: error})
		})
		feed.on('stop', function() { 
			pool.emit('db-stop', {db_name:db_name})
		})
		feed.on('retry', function(info) { 
			pool.emit('db-retry', {db_name:db_name, retry: info})
		})
		feed.on('wait', function() { 
			pool.emit('db-wait', {db_name:db_name})
		})
		feed.on('timeout', function() { 
			pool.emit('db-timeout', {db_name:db_name})
		})

		// keep a reference to the feed in our feed pool
		all_feeds[db_name] = feed
		
	}


	// follow the '_db_updates' feed of couchdb
	// to keep up with new and removed dbs
	var global_changes = follow({db:opts.couch+'_db_updates'})

	global_changes.on('change', function(db_change) {
		// when a new db has been created, add it to the pool
		if(db_change.type == 'created')
			_add(db_change.db_name)

		// if it has been deleted, remove it
		else if(db_change.type == 'deleted')
			_remove(db_change.db_name)

		// other events: 'updated', 'ddoc-updated'
	})
	global_changes.on('error', function(error) {
		pool.emit('error', error)
	})
	
	// to bootstrap, query all dbs of the couchdb instance
	request(opts.couch+'_all_dbs', function(err, res, all_dbs) {
		if(err)
			return pool.emit('error', 'the query to _all_dbs failed:\n' + err)
		else if(!all_dbs)
			return pool.emit('warning', 'the query to _all_dbs has not returned any databases')

		all_dbs.forEach(function(db_name) { _add(db_name) })
	})

	return pool
}
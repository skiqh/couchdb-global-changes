var EventEmitter = require('events').EventEmitter
var request = require('request').defaults({json:true})
var follow = require('follow')
var fs = require('fs')

module.exports = function(opts) {
	if(typeof opts == 'string')
		opts = { couch: opts }
	if(!opts.couch)
		opts.couch = 'http://127.0.0.1:5984'
	if(opts.filter)
		opts.filter = new RegExp(opts.filter)

	var persistence_layer
	if(opts.persist) {
		if(typeof opts.persist == 'string' && opts.persist.match(/\.json$/))
			persistence_layer = require('./persist.js')(opts.persist)
	}

	opts.couch = opts.couch.replace(/\/*$/, '/')
	
	var pool = new EventEmitter()

	// this is where we keep the references to the feeds
	var all_feeds = {}

	// helper funtion: count the entryies in the all_feeds object
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
	var _add = function(db_name, param_since) {

		if(opts.filter && !opts.filter.test(db_name))
			return pool.emit('debug', '[_add] filter out db ' + db_name)
			
		if(db_name in all_feeds) {
			pool.emit('warning', "[_add] already following feed for db " + db_name)
		} else {
			var feed_options = { db: opts.couch + db_name }

			if(!param_since && opts.persist && persistence_layer)
				return persistence_layer.get(db_name, 0, function(err, result) {
					if(err)
						return pool.emit('error', err)
					
					console.info("got a value for", db_name, result)
					_add(db_name, result)
				})
			else if(param_since || param_since == 0)
				feed_options.since = param_since
			else if(opts.since && (opts.since == 'now' || !isNaN(opts.since)))
				feed_options.since = opts.since
			else if(opts.since && opts.since.hasOwnProperty(db_name))
				feed_options.since = opts.since[db_name]
			else
				feed_options.since = 0

			if(opts.include_docs && (opts.include_docs === true || opts.include_docs === false ))
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

			// iriscouch's follow does not keep a reference to the db object
			// so we have to keep it ourselves
			var db_obj
			feed.on('confirm', function(start_db_obj) {
				db_obj = start_db_obj
				pool.emit('db-confirm', {db_name:db_name, confirm:start_db_obj})
				// now begin the actual feed
				if(feed.pending && feed.pending.request && feed.pending.request.resume)
					feed.resume()
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
					pool.emit('db-progress', {db_name:db_name, ratio: docs_ratio })
					pool.emit('progress', db_ratio+sub_ratio)
				}

			})

			feed.on('stop', function() { 
				// remove the reference to the feed
				delete all_feeds[db_name]
				// emit the according event
				pool.emit('db-removed', {db_name:db_name})
			})
			feed.on('catchup', function(seq_id) {
				if(persistence_layer)
					persistence_layer.set(db_name, seq_id)

				pool.emit('db-catchup', {db_name:db_name, catchup:seq_id})

				if(pool.caught_up_dbs() == pool.total_dbs())
					pool.emit('catchup')
			})

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

			// keep a reference to the feed in our feed pool
			all_feeds[db_name] = feed
		}
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
		all_dbs.forEach(_add.bind(pool))
	})

	return pool
}
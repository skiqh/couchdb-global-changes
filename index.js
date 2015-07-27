var EventEmitter = require('events').EventEmitter
var request = require('request').defaults({json:true})
var follow = require('follow')


module.exports = function(opts) {
	if(!opts.couch)
		opts.couch = 'http://127.0.0.1:5984'
	if(opts.filter)
		opts.filter = new RegExp(opts.filter)

	opts.couch = opts.couch.replace(/\/*$/, '/')
	
	var pool = new EventEmitter()

	// this is where we keep the references to the feeds
	var all_feeds = {}

	// helper funtion: count the entryies in the all_feeds object
	var total_dbs = function() {
		return Object.keys(all_feeds).length
	}
	// helper function: count all feeds that have caught up
	var caught_up_dbs = function() {
		return Object.keys(all_feeds).filter(function(db_name) { return all_feeds[db_name].caught_up }).length
	}

	pool.remove = function(db_name) {
		if(!(db_name in all_feeds)) {
			pool.emit('warning', "[pool.remove] not following feed for db " + db_name)
		} else {
			var feed = all_feeds[db_name]
			// stopping the feed will result in the 'stop' event below being emitted
			feed.stop()
		}
	}
	pool.add = function(db_name) {

		if(opts.filter && !opts.filter.test(db_name))
			return pool.emit('debug', '[pool.add] filter out db ' + db_name)
			
		if(db_name in all_feeds) {
			pool.emit('warning', "[pool.add] already following feed for db " + db_name)
		} else {
			// instantiate the feed
			var feed = follow({db:opts.couch + db_name, since:(opts.since || 0), include_docs:opts.include_docs })

			// pause the feed so we can emit confirm and start events
			feed.pause()

			// iriscouch's follow does not keep a reference to the db object
			// so we have to keep it ourselves
			var db_obj
			feed.on('confirm', function(start_db_obj) {
				db_obj = start_db_obj
				pool.emit('dbfeed', {db_name:db_name, type:'confirm' })
				// now begin the actual feed
				feed.resume()
			})

			feed.on('change', function(change) { 
				// emit *the* global change event
				pool.emit('change', {change:change, db_name:db_name})

				// only during the catchup phase, emit progress events
				if(!feed.caught_up) {
					// calculate some progress variables
					var docs_ratio = parseInt(100*change.seq/db_obj.update_seq)/100
					var db_ratio = caught_up_dbs()/total_dbs()
					var sub_ratio = docs_ratio/total_dbs()

					// and emit them
					pool.emit('dbfeed', {db_name:db_name, type:'progress', details: docs_ratio })
					pool.emit('progress', db_ratio+sub_ratio)
				}

			})

			feed.on('stop', function() { 
				// remove the reference to the feed
				delete all_feeds[db_name]
				// emit the according event
				pool.emit('dbfeed', {db_name:db_name, type:'removed'})
			})
			feed.on('catchup', function() {

				pool.emit('dbfeed', {db_name:db_name, type:'catchup' })

				if(caught_up_dbs() == total_dbs())
					pool.emit('catchup')
			})

			// pass on all other feed events
			feed.on('start', function() {
				pool.emit('dbfeed', {db_name:db_name, type:'start' })
			})
			feed.on('error', function(error) { 
				pool.emit('dbfeed', {db_name:db_name, type:'error', details: error })
			})
			feed.on('stop', function() { 
				pool.emit('dbfeed', {db_name:db_name, type:'stop' })
			})
			feed.on('retry', function(info) { 
				pool.emit('dbfeed', {db_name:db_name, type:'retry', details: info })
			})
			feed.on('wait', function(info) { 
				pool.emit('dbfeed', {db_name:db_name, type:'wait', details: info })
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
			pool.add(db_change.db_name)

		// if it has been deleted, remove it
		else if(db_change.type == 'deleted')
			pool.remove(db_change.db_name)

		// other events: 'updated', 'ddoc-updated'
	})
	global_changes.on('error', function(error) {
		pool.emit('error', error)
	})
	
	// to bootstrap, query all dbs of the couchdb instance
	request(opts.couch+'_all_dbs', function(err, res, all_dbs) {
		pool.emit('total-dbs', all_dbs.length)
		all_dbs.forEach(pool.add.bind(pool))
	})

	return pool
}
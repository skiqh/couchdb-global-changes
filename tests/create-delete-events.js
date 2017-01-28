var request = require('request').defaults({json:true})
var minimist = require('minimist')
var assert = require("assert")
var async = require('async')
var merge = require('merge')

var PREFIX = 'cgc-tests-create-delete-'


var opts = minimist(process.argv.slice(2),
	{	default:
		{	couch: 'http://127.0.0.1:5984'
		,	include_docs: true
		,	persist: '_local'
		,	namespace: 'tests'
		,	timeout: 500
		}
	}
)
if(process.env.COUCH)
	opts.couch = process.env.COUCH


var nano = require('nano')(opts.couch)
// var cgc = require('../index.js')(opts)

console.warn = function() {}
var new_db_name = PREFIX + 'new-db'
var exclude_db_name = PREFIX + 'exclude-db'
var options_create_delete = merge(opts, {include: '^' + PREFIX, exclude: '^' + exclude_db_name + '$'})
var cgc_create_delete = new new require('../index.js')(options_create_delete)


describe('react to db create/delete events', function() {

	describe('db-add', function () {

		before(function(done) {
			nano.db.destroy(new_db_name, function(err, res) {
				if(err && err.error !== 'not_found')
					console.log("destroy %s", new_db_name, err, res)
				done()
			})
		})
		after(function(done) {
			done()
		})
		it('should emit a "db-confirm" event when a new database is created', function (done) {
			// cgc_create_delete.removeAllListeners()
			cgc_create_delete.on('db-confirm', function(details) {
				assert.equal(details.db_name, new_db_name)
				done()
				// console.error("[db-add] db-confirm", details)
				// if(details.db_name == new_db_name) {
				// 	cgc_create_delete.removeAllListeners()
				// 	done()
				// } else {
				// 	console.warn("[db-add] db-confirm db_name mismatch", details.db_name, new_db_name)
				// }
			})

			nano.db.create(new_db_name, function(err, res) {
				assert(!err, 'could not create database "'+new_db_name+'":' + err)
				if(err)
					done()
			})

		})
	})
	describe('db-remove', function () {

		before(function(done) {
			nano.db.create(new_db_name, function(err, res) { done() })
		})
		after(function(done) {
			done()
		})
		it('should emit a "db-removed" event when a new database is deleted', function (done) {
			cgc_create_delete.removeAllListeners()
			cgc_create_delete.on('db-removed', function(details) {
				// console.error("[db-remove] db-removed", details)
				if(details.db_name == new_db_name) {
					cgc_create_delete.removeAllListeners()
					done()
				} else {
					console.warn("[db-remove] db-confirm db_name mismatch", details.db_name, new_db_name)
				}
			})

			nano.db.destroy(new_db_name, function(err, res) {
				assert(!err, 'could not delete database "'+new_db_name+'"')
			})

		})
	})
	describe('ignore-db-add', function () {
		before(function(done) {
			nano.db.destroy(exclude_db_name, function(err, res) { done() })
		})
		after(function(done) {
			done()
		})

		it('should not emit a "db-confirm" event when a database matching the exclude flag is created (within ' + opts.timeout + ' ms)', function (done) {
			this.timeout(2000)

			cgc_create_delete.removeAllListeners()
			cgc_create_delete.on('db-confirm', function(details) {
				if(details.db_name == exclude_db_name) {
					cgc_create_delete.removeAllListeners()
					assert(false, 'creation of db "'+exclude_db_name+'" should not have fired the "db-confirm" event')
					done()
				} else {
					console.warn("[ignore-db-add] db-confirm db_name mismatch", details.db_name, exclude_db_name)
				}
			})
			setTimeout(function() {
				// console.error("no db-confirm event fired within "+opts.timeout+" ms")
				cgc_create_delete.removeAllListeners()
				done()
			}, opts.timeout)

			nano.db.create(exclude_db_name, function(err, res) {
				assert(!err, 'could not create database "'+exclude_db_name+'":' + err)
				// console.error(exclude_db_name + " has been created", err, res)
			})

		})
	})
	describe('ignore-db-remove', function () {
		before(function(done) {
			// nano.db.create(exclude_db_name, function(err, res) { done() })
			done()
		})
		after(function(done) {
			done()
		})

		it('should not emit a "db-removed" event when a database matching the exclude flag is deleted (within ' + opts.timeout + ' ms)', function (done) {
			this.timeout(2000)

			cgc_create_delete.removeAllListeners()
			cgc_create_delete.on('db-removed', function(details) {
				if(details.db_name == exclude_db_name) {
					cgc_create_delete.removeAllListeners()
					assert(false, 'removal of db "'+exclude_db_name+'" should not have fired the "db-removed" event')
					done()
				} else {
					console.warn("[ignore-db-add] db-confirm db_name mismatch", details.db_name, exclude_db_name)
				}
			})
			setTimeout(function() {
				// console.error("no db-removed event fired within "+opts.timeout+" ms")
				cgc_create_delete.removeAllListeners()
				done()
			}, opts.timeout)

			nano.db.destroy(exclude_db_name, function(err, res) {
				assert(!err, 'could not delete database "'+exclude_db_name+'":'+err)
				// console.error(exclude_db_name + " has been deleted", err, res)
			})

		})
	})
})

var request = require('request').defaults({json:true})
var minimist = require('minimist')
var assert = require("assert")
var async = require('async')
var merge = require('merge')

var PREFIX = 'cgc-tests-'


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
// var cgc = require('./index.js')(opts)

console.warn = function() {}


describe('react to db create/delete events', function() {

	var new_db_name = PREFIX + 'new-db'
	var exclude_db_name = PREFIX + 'exclude-db'
	var options_create_delete = merge(opts, {include: '^' + new_db_name + '$', exclude: '^' + exclude_db_name + '$'})
	console.log("options_create_delete", options_create_delete)
	var cgc_create_delete = new new require('./index.js')(options_create_delete)
	console.log("cgc_create_delete", cgc_create_delete.options())
	cgc_create_delete.on('debug', function(message) {
		// console.log("debug", message)
	})

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


describe('react to document edit events', function() {
	var edit_db_name = PREFIX + 'edit-db'
	var edit_db = nano.use(edit_db_name)
	var new_doc_name = 'new-document-1'
	var new_doc = {some: 'document', having: 'properties'}

	before(function(done) {
		nano.db.destroy(edit_db_name, function(err, res) {
			nano.db.create(edit_db_name, function(err, res) {
				done()
			})
		})
	})
	after(function(done) {
		done()
	})

	describe('add-document', function () {

		it('should emit a "db-change" event when a new document is created', function (done) {
			var edit_db = nano.use(edit_db_name)

			cgc.removeAllListeners()
			cgc.on('db-change', function(details) {
				assert.equal(details.db_name, edit_db_name)
				assert.equal(details.change.id, new_doc_name)
				delete details.change.doc._id
				delete details.change.doc._rev
				assert.deepEqual(details.change.doc, new_doc)
				cgc.removeAllListeners()
				done()
			})
			edit_db.insert(new_doc, new_doc_name, function(err, res) {
				assert(!err, 'could not insert document into db "'+edit_db_name+'": \n' + err)
				// console.info(new_doc_name + " has been inserted", err, res)
			})
		})
	})
})


describe('emit proper progress events', function() {
	var progress1_db_name = PREFIX + 'progress1-db'
	// var new_doc_name = 'new-document-1'
	// var new_doc = {some: 'document', having: 'properties'}
	var ten_docs =
		[	{	name: 'one',   some_val: 1 }
		,	{	name: 'two',   some_val: 2 }
		,	{	name: 'three', some_val: 3 }
		,	{	name: 'four',  some_val: 4 }
		,	{	name: 'five',  some_val: 5 }
		,	{	name: 'six',   some_val: 6 }
		,	{	name: 'seven', some_val: 7 }
		,	{	name: 'eight', some_val: 8 }
		,	{	name: 'nine',  some_val: 9 }
		,	{	name: 'ten',   some_val: 10 }
		]
	var cgc_progress = new require('./index.js')(merge(opts, {since:0, include: progress1_db_name}))
	console.log("cgc_progress", cgc_progress.options())
	var edit_db = nano.use(progress1_db_name)

	before(function(done) {
		nano.db.destroy(progress1_db_name, function(err, res) {
			if(err && err.error !== 'not_found')
				console.log("destroy %s", progress1_db_name, err, res)

			nano.db.create(progress1_db_name, function(err, res) {
				var progress1_db = nano.use(progress1_db_name)
				progress1_db.bulk({docs:ten_docs}, function(err, res) {
					assert(!err, 'could not insert tan documents into db "'+progress1_db_name+'": \n' + err)
					done()
				})
			})
		})
	})
	after(function(done) {
		nano.db.destroy(progress1_db_name, done)
	})

	describe('process ten test documents', function () {

		it('should emit "db-progress" events when catching up to existing changes', function (done) {
			var progress1_db = nano.use(progress1_db_name)

			cgc_progress.removeAllListeners()
			var last_progress = -1
			cgc_progress.on('db-progress', function(details) {
				assert.equal(details.db_name, progress1_db_name)
				assert(details.progress >= last_progress, "details.process did not increase")
				last_progress = details.progress
				// assert.equal(details.change.id, new_doc_name)
				// delete details.change.doc._id
				// delete details.change.doc._rev
				// assert.deepEqual(details.change.doc, new_doc)
				// cgc.removeAllListeners()
				if(details.progress >= 1)
					done()
			})
			// function put_next_doc(idx) {
			// 	console.log("put tendoc[%s]", idx)
			// 	if(!idx)
			// 		idx = 0
			// 	if(idx >= ten_docs.length)
			// 		return console.log("idx is too high", idx, ten_docs.length)

			// 	progress1_db.insert(ten_docs[idx], function(err, res) {
			// 		assert(!err, 'could not insert document into db "'+progress1_db_name+'": \n' + err)
			// 		// console.log("setTimeout", idx+1)
			// 		setTimeout(put_next_doc, 70, idx+1)
			// 	})
			// }
			// setTimeout(put_next_doc, 70, 0)
			// edit_db.insert(new_doc, new_doc_name, function(err, res) {
			// 	assert(!err, 'could not insert document into db "'+progress1_db_name+'": \n' + err)
			// 	// console.info(new_doc_name + " has been inserted", err, res)
			// })
		})
	})
})

describe('understand regular `since` parameters:', function() {
	var resolve_since = require('./index.js').resolve_since

	describe('invalid given_seq (null/undefined/negative)', function() {
		it('should interpret the given_seq as zero', function(done) {
			var undefseq
			var undefsince
			assert.equal(resolve_since(undefseq, undefsince), 0)
			assert.equal(resolve_since(undefseq, null), 0)

			assert.equal(resolve_since(null, undefsince), 0)
			assert.equal(resolve_since(null, null), 0)

			assert.equal(resolve_since(-100, undefsince), 0)
			assert.equal(resolve_since(-100, null), 0)


			assert.equal(resolve_since(undefseq, 100), 100)
			assert.equal(resolve_since(undefseq, 100), 100)

			assert.equal(resolve_since(null, 100), 100)
			assert.equal(resolve_since(null, 100), 100)

			assert.equal(resolve_since(-100, 100), 100)
			assert.equal(resolve_since(-100, 100), 100)


			assert.equal(resolve_since(undefseq, -100), 0)
			assert.equal(resolve_since(undefseq, -100), 0)

			assert.equal(resolve_since(null, -100), 0)
			assert.equal(resolve_since(null, -100), 0)

			assert.equal(resolve_since(-100, -100), 0)
			assert.equal(resolve_since(-100, -100), 0)

			done()
		})
	})
	describe('invalid since (undefined/null)', function() {
		it('should return the given seq or 0', function(done) {
			var undefsince
			assert.equal(resolve_since(0, undefsince), 0)
			assert.equal(resolve_since(100, undefsince), 100)
			assert.equal(resolve_since(0, null), 0)
			assert.equal(resolve_since(100, null), 100)
			done()
		})
	})
	describe('since == "now"', function() {
		it('should always return the value "now"', function(done) {
			var undefseq
			assert.equal(resolve_since(undefseq, "now"), "now")
			assert.equal(resolve_since(null, "now"), "now")
			assert.equal(resolve_since(0, "now"), "now")
			assert.equal(resolve_since(100, "now"), "now")
			assert.equal(resolve_since(-100, "now"), "now")
			done()
		})
	})
	describe('since == "0" (string)', function() {
		it('should always return the value 0', function(done) {
			assert.equal(resolve_since(null, '0'), 0)
			assert.equal(resolve_since(0, '0'), 0)
			assert.equal(resolve_since(100, '0'), 0)
			assert.equal(resolve_since(-100, '0'), 0)
			done()
		})
	})
	describe('since == "10" (string)', function() {
		it('should always return the value 10', function(done) {
			assert.equal(resolve_since(null, '10'), 10)
			assert.equal(resolve_since(0, '10'), 10)
			assert.equal(resolve_since(100, '10'), 10)
			assert.equal(resolve_since(-100, '10'), 10)
			done()
		})
	})
	describe('since == 0 (number)', function() {
		it('should always return the value 0', function(done) {
			assert.equal(resolve_since(null, 0), 0)
			assert.equal(resolve_since(0, 0), 0)
			assert.equal(resolve_since(100, 0), 0)
			assert.equal(resolve_since(-100, 0), 0)
			done()
		})
	})
	describe('since == 10 (number)', function() {
		it('should always return the value 10', function(done) {
			assert.equal(resolve_since(null, 10), 10)
			assert.equal(resolve_since(0, 10), 10)
			assert.equal(resolve_since(100, 10), 10)
			assert.equal(resolve_since(-100, 10), 10)
			done()
		})
	})
})


describe('understand negative `since` parameters:', function() {
	var resolve_since = require('./index.js').resolve_since

	describe('since < 0 (but can replay)', function() {
		it('should return (given_seq - n)', function(done) {
			assert.equal(resolve_since(10, -1), 9)
			assert.equal(resolve_since(1000, -1), 999)
			assert.equal(resolve_since(10, -10), 0)
			assert.equal(resolve_since(1000, -999), 1)
			done()
		})
	})
	describe('since < 0 (but cannot replay)', function() {
		it('should return 0', function(done) {
			assert.equal(resolve_since(10, -11), 0)
			assert.equal(resolve_since(1000, -2000), 0)
			assert.equal(resolve_since(10, -10), 0)
			assert.equal(resolve_since(1000, -9999), 0)
			done()
		})
	})
})
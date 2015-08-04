var request = require('request').defaults({json:true})
var minimist = require('minimist')
var assert = require("assert")
var sinon = require('sinon')
var async = require('async')

var PREFIX = 'cgc-tests-'
var new_db_name = PREFIX + 'new-db'
var edit_db_name = PREFIX + 'edit-db'
var exclude_db_name = PREFIX + 'exclude-db'

var opts = minimist(process.argv.slice(2), 
	{	default: 
		{	couch: 'http://127.0.0.1:5984'
		,	include: '^' + PREFIX
		,	exclude: '^' + exclude_db_name
		,	include_docs: true
		,	timeout: 500
		}
	}
)
if(process.env.COUCH)
	opts.couch = process.env.COUCH


var nano = require('nano')(opts.couch)
var cgc = require('./index.js')(opts)

console.warn = function() {}

describe('react to db create/delete events', function() {
	var confirm_spy = sinon.spy()
	var remove_spy = sinon.spy()

	describe('db-add', function () {

		before(function(done) {
			nano.db.destroy(new_db_name, function(err, res) { done() })
		})
		after(function(done) {
			done()
		})
		it('should emit a "db-confirm" event when a new database is created', function (done) {
			cgc.removeAllListeners()
			cgc.on('db-confirm', function(details) {
				// console.error("[db-add] db-confirm", details)
				if(details.db_name == new_db_name) {
					cgc.removeAllListeners()
					done()
				} else {
					console.warn("[db-add] db-confirm db_name mismatch", details.db_name, new_db_name)
				}
			})

			nano.db.create(new_db_name, function(err, res) {
				assert(!err, 'could not create database "'+new_db_name+'":' + err)
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
			cgc.removeAllListeners()
			cgc.on('db-removed', function(details) {
				// console.error("[db-remove] db-removed", details)
				if(details.db_name == new_db_name) {
					cgc.removeAllListeners()
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

			cgc.removeAllListeners()
			cgc.on('db-confirm', function(details) {
				if(details.db_name == exclude_db_name) {
					cgc.removeAllListeners()
					assert(false, 'creation of db "'+exclude_db_name+'" should not have fired the "db-confirm" event')
					done()
				} else {
					console.warn("[ignore-db-add] db-confirm db_name mismatch", details.db_name, exclude_db_name)
				}
			})
			setTimeout(function() {
				// console.error("no db-confirm event fired within "+opts.timeout+" ms")
				cgc.removeAllListeners()
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

			cgc.removeAllListeners()
			cgc.on('db-removed', function(details) {
				if(details.db_name == exclude_db_name) {
					cgc.removeAllListeners()
					assert(false, 'removal of db "'+exclude_db_name+'" should not have fired the "db-removed" event')
					done()
				} else {
					console.warn("[ignore-db-add] db-confirm db_name mismatch", details.db_name, exclude_db_name)
				}
			})
			setTimeout(function() {
				// console.error("no db-removed event fired within "+opts.timeout+" ms")
				cgc.removeAllListeners()
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

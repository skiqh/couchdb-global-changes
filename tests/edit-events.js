var request = require('request').defaults({json:true})
var minimist = require('minimist')
var assert = require("assert")
var async = require('async')
var merge = require('merge')

var PREFIX = 'cgc-tests-edit-'


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

var edit_db_name = PREFIX + 'edit-db'
var edit_db = nano.use(edit_db_name)
var new_doc_name = 'new-document-1'
var new_doc = {some: 'document', having: 'properties'}
var options_edit = merge(opts, {include: '^' + edit_db_name + '$'})
var cgc_edit = new new require('../index.js')(options_edit)


describe('react to document edit events', function() {

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

			cgc_edit.removeAllListeners()
			cgc_edit.on('db-change', function(details) {
				assert.equal(details.db_name, edit_db_name)
				assert.equal(details.change.id, new_doc_name)
				delete details.change.doc._id
				delete details.change.doc._rev
				assert.deepEqual(details.change.doc, new_doc)
				cgc_edit.removeAllListeners()
				done()
			})
			edit_db.insert(new_doc, new_doc_name, function(err, res) {
				assert(!err, 'could not insert document into db "'+edit_db_name+'": \n' + err)
				// console.info(new_doc_name + " has been inserted", err, res)
			})
		})
	})
})
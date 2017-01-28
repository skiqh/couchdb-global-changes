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
// var cgc = require('../index.js')(opts)

console.warn = function() {}

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
	var cgc_progress = new require('../index.js')(merge(opts, {since:0, include: progress1_db_name}))

	// cgc_progress.on('*', function(arg) {
	// 	console.log(this.event, arg)
	// })

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

			var last_progress = -1
			cgc_progress.on('db-progress', function(details) {
				console.log("    PROGRESS", details.progress)
				assert.equal(details.db_name, progress1_db_name)
				assert(details.progress >= last_progress, "details.process did not increase")
				assert(details.progress <= 1, "details.process is larger than 1")
				assert(details.progress >= 0, "details.process is smalle than 0")
				last_progress = details.progress
			})
			cgc_progress.on('catchup', done)
		})
	})
})

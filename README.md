couchdb-global-changes
======================

Does what it says on the tin: emit a `db-change` event for each document change in each db of a couchdb instance. Can also persist its progress (sequence id-wise) to a file or in the monitored databases.

Installation
------------

```bash
npm install couchdb-global-changes
```

Simple usage
------------

```javascript
var couchdb_changes = require('couchdb-global-changes')
var feed = couchdb_changes('http://user:pass@127.0.0.1')

feed.on('db-change', function(details) {
    console.log('document changed: %s / %s', details.db_name, details.change.id)
})
feed.on('error', function(err) {
    console.error('something is wrong:', err)
    process.exit()
})
```

Advanced usage
--------------

```javascript
var couchdb_changes = require('couchdb-global-changes')
var twilio = require('twilio')('ACCOUNT_SID', 'AUTH_TOKEN')

var options = 
    {   couch: 'http://user:pass@127.0.0.1'
    ,   filter: '^userdb-'
    ,   persist: '_local'
    ,   namespace: 'sms-daemon'
    ,   include_docs: true
    }

var feed = couchdb_changes(options)

feed.on('db-change', function(details) {

    var doc = details.change.doc
    if(!doc.type == 'sms-message')
        return

    twilio.sendMessage(
            {   to: doc.recipient
            ,   from: doc.sender
            ,   body: doc.message
            }
        ,   function(err, responseData) {
                if (!err)
                    console.log('Successfully sent an sms from %s to %s', doc.sender, doc.recipient)
                else
                    console.error('Could not send sms from %s to %s:\n', doc.sender, doc.recipient, err)
        }
    )
})

feed.on('db-persist', function(details) {
    // after this, we can be sure the update sequence has been saved.
    // when this script is started again, it will pick up just where
    // it left off and not process any document a second time.
    console.log("%s processed all documents in the database %s (up to update-sequence %s)", feed.namespace, details.db_name, details.persist.seq)
})

```


Details
-------

### Options

* if `options` is a string, it is interpreted as the url to a couchdb instance


#### `options.couch`
* the root url of the couchdb instance
* defaults to `http://127.0.0.1:5984`

#### `options.include`
* if provided, will be evaluated as a regular expression
* each db's name must then match that regular expression

#### `options.exclude`
* if provided, will be evaluated as a regular expression
* each db's name must then not match that regular expression

#### `options.since` can be one of
* `'now'` or an integer sequence id: all feeds will use this same value
* `{ <db1_name>: 'now', <db2_name>: 1234 }`: provide a value for each db's name individually (good for managing resuming operations)
* defaults to `0` for every feed

#### `options.include_docs` can be one of
* `true` or `false`: all feeds will use this same value
* `{ <db1_name>: true, <db2_name>: false }`: provide a value for each db's name individually
* defaults to `false` for every feed

#### `options.persist` can be
* a string containg the path to a JSON file, where the db's sequences can be stored and later retrieved
* `'_local'`, which will persist the db's sequence ids to `{db}/_local/couchdb-global-changes:{namespace}`
* nothing else right now

#### `options.persist_debounce`
* to avoid hammering the filesystem or the db with write queries, the actual call to persist sequence ids is debounced by this amount of milliseconds
* defaults to 200 ms

#### `options.namespace` (mandatory if `options.persist` is provided)
* this allows the persistence layer to save sequence ids individually for every script that invokes the couchdb-global-changes module.

### Functions

* `feed.total_dbs()` returns the number of dbs that are being followed
* `feed.caught_up_dbs()` returns the number of dbs have emitted the `catchup` event

### Events

#### `progress` | `function(ratio)`
* calculated global progress during the catchup-phase.
* `ratio` goes from 0 to 1

#### `catchup` | `function()`
* all followed dbs have caught up

#### `db-catchup` | `function(details)`
* the db `details.db_name` has caught up to sequence id `details.seq` (which is equal to `details.catchup`)
* details also contains the current `caught_up_dbs` and `total_dbs`

#### `db-progress` | `function(ratio)`
* calculated progress of a single db during the catchup-phase.
* `ratio` goes from 0 to 1

#### `db-removed` | `function(details)`
* the db `details.db_name` has been removed from the feed, probably due to deletion of the db

#### `db-*` | `function(details)`
* each of iriscouch's follow event is forwarded with a `db-` prefix
* the originating db's name is passed as `details.db_name`
* arguments are passed as `details.<eventname>`
* Example: the `db-change` event gets passed `{ db_name: 'foo', change: <change-obj> }`

Tests
-----

This is still work in progress.


Changes
-------

### 2.0.0

* renamed `options.filter` to `options.include` (and add accordingly `options.exclude`)
* added `"_local"` as an option to `options.persist`
* added `options.namespace` (needed for namespacing in the persistence layer)
* added event `db-persist` which gets emitted after the current sequence id has been persisted to disk/db.
* added `options.persist_debounce`
* added `caught_up_dbs` and `total_dbs` info to the `db-catchup` event's `details`
* (internal) persistence layers are now async
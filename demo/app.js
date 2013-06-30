/***

QUICK START:
1. Set the below configuration variables
2. Run "node app"
3. There is no step 3

***/

// Configuration
var MONGO_URI = "mongodb://localhost:27017/test";
var BALANCED_MARKETPLACE_URI = "/v1/marketplaces/TEST-YourMarketplaceURI";
var BALANCED_API_KEY = "YourAPIKey";
var CAMPAIGN_GOAL = 1000; // Your fundraising goal, in dollars

// Initialize an Express app
var express = require('express');
var app = express();
app.use("/static", express.static(__dirname + '/static')); // Serve static files
app.use(express.bodyParser()); // Can parse POST requests
app.listen(1337); // The best port
console.log("App running on http://localhost:1337");

// Serve homepage
app.get("/",function(request,response){

    // TODO: Actually get fundraising total
    /*response.send(
        "<link rel='stylesheet' type='text/css' href='/static/fancy.css'>"+
        "<h1>Your Crowdfunding Campaign</h1>"+
        "<h2>raised ??? out of $"+CAMPAIGN_GOAL.toFixed(2)+"</h2>"+
        "<a href='/fund'>Fund This</a>"
    );*/

    Q.fcall(_getTotalFunds).then(function(total){
        response.send(
            "<link rel='stylesheet' type='text/css' href='/static/fancy.css'>"+
            "<h1>Your Crowdfunding Campaign</h1>"+
            "<h2>raised $"+total.toFixed(2)+" out of $"+CAMPAIGN_GOAL.toFixed(2)+"</h2>"+
            "<a href='/fund'>Fund This</a>"
        );
    });

});

// Serve funding page
app.get("/fund",function(request,response){
    response.sendfile("fund.html");
});

// Pay via Balanced
app.post("/pay/balanced",function(request,response){

    // Payment Data
    var card_uri = request.body.card_uri;
    var amount = request.body.amount;
    var name = request.body.name;

    // TODO: Charge card using Balanced API
    /*response.send("Your card URI is: "+request.body.card_uri);*/

    Q.fcall(function(){

        // Create an account with the Card URI
        return _callBalanced("/accounts",{
            card_uri: card_uri
        });

    }).then(function(account){

        // Charge said account for the given amount
        return _callBalanced("/debits",{
            account_uri: account.uri,
            amount: Math.round(amount*100) // Convert from dollars to cents, as integer
        });

    }).then(function(transaction){

        // Donation data
        var donation = {
            name: name,
            amount: transaction.amount/100, // Convert back from cents to dollars.
            transaction: transaction
        };

        // TODO: Actually log the donation with MongoDB
		/*return Q.fcall(function(){
		    return donation;
		});*/

		// Record donation to database
		return _recordDonation(donation);

    }).then(function(donation){

        // Personalized Thank You Page
        response.send(
            "<link rel='stylesheet' type='text/css' href='/static/fancy.css'>"+
            "<h1>Thank you, "+donation.name+"!</h1> <br>"+
            "<h2>You donated $"+donation.amount.toFixed(2)+".</h2> <br>"+
            "<a href='/'>Return to Campaign Page</a> <br>"+
            "<br>"+
            "Here's your full Donation Info: <br>"+
            "<pre>"+JSON.stringify(donation,null,4)+"</pre>"
        );

    },function(err){
        response.send("Error: "+err);
    });

});

// Calling the Balanced REST API
var Q = require('q');
var httpRequest = require('request');
function _callBalanced(url,params){

    // Promise an HTTP POST Request
    var deferred = Q.defer();
    httpRequest.post({

        url: "https://api.balancedpayments.com"+BALANCED_MARKETPLACE_URI+url,
        auth: {
            user: BALANCED_API_KEY,
            pass: "",
            sendImmediately: true
        },
        json: params

    }, function(error,response,body){

        // Handle all Bad Requests (Error 4XX) or Internal Server Errors (Error 5XX)
        if(body.status_code>=400){
            deferred.reject(body.description);
            return;
        }

        // Successful Requests
        deferred.resolve(body);

    });
    return deferred.promise;

}

// Recording a Donation
var mongo = require('mongodb').MongoClient;
function _recordDonation(donation){

    // Promise saving to database
    var deferred = Q.defer();
    mongo.connect(MONGO_URI,function(err,db){
        if(err){ return deferred.reject(err); }

        // Insert donation
        db.collection('donations').insert(donation,function(err){
            if(err){ return deferred.reject(err); }

            // Promise the donation you just saved
            deferred.resolve(donation);

            // Close database
            db.close();

        });
    });
    return deferred.promise;

}

// Get total donation funds
function _getTotalFunds(){

    // Promise the result from database
    var deferred = Q.defer();
    mongo.connect(MONGO_URI,function(err,db){
        if(err){ return deferred.reject(err); }

        // Get amounts of all donations
        db.collection('donations')
        .find( {}, {amount:1} ) // Select all, only return "amount" field
        .toArray(function(err,donations){
            if(err){ return deferred.reject(err); }

            // Sum up total amount, and resolve promise.
            var total = donations.reduce(function(previousValue,currentValue){
                return previousValue + currentValue.amount;
            },0);
            deferred.resolve(total);

            // Close database
            db.close();

        });
    });
    return deferred.promise;

}
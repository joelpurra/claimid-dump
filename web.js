"use strict";

/*jslint white: true, todo: true */
/*global require: true, process: true, __dirname: true, console: true, JoelPurra: true */

var express = require('express'),
    requestHTTP = require("request"),
    cheerio = require("cheerio"),
    app = express(),
    JoelPurra = JoelPurra || {},
    port = process.env.PORT || 5000;

app.use(express.logger());

(function(namespace, pluginName) {
    // This function quite obviously is a modified client side plugin, and should be rewritten to more of a server side format.
    var $,

        dateFormatRx = /\d{4}-\d{2}-\d{2}/,

        internal = {
            extractLink: function() {
                var $this = $(this),
                    $link = $this.find(".taggedlink"),
                    who = $this.find(".info_link").text().split("&nbsp;")[0].split("|").map(function(str) {
                        return str.trim().split("\n")[0].trim();
                    }),
                    result = {
                        url: $link.attr("href"),
                        title: $link.text().trim(),
                        tags: $this.find("[rel~=tag]").map(function() {
                            return $(this).text();
                        }),
                        description: $this.find(".public_description").eq(0).text(),
                        added: $this.find(".date_added").text().match(dateFormatRx)[0],
                        date: $this.find(".date").text(),
                        about: who[0],
                        by: who[1]
                    };

                return result;
            },

            extractGroup: function() {
                var $this = $(this),
                    titleHtml = $this.find(".group_header").eq(0).html(),
                    result = {
                        title: titleHtml.substring(0, titleHtml.indexOf("<")).trim(),
                        description: $this.find(".group_description .text").text(),
                        links: $this.find(".xfolkentry").map(internal.extractLink)
                    };

                return result;
            },

            dump: function($context) {
                var result = {
                    datetime: new Date().valueOf(),
                    groups: $(".display_group", $context).map(internal.extractGroup)
                };

                return result;
            }
        },

        plugin = {
            dump: function(cheerio, $context) {
                $ = cheerio;
                return internal.dump($context);
            }
        },

        init = function() {
            namespace[pluginName] = plugin;
        };

    init();

}(JoelPurra, "claimIdDump"));

var getClaimIdCacheUrl = function(username) {
    // This function is modified client side code, and should be rewritten to more of a server side format.
    var claimIdBaseUrl = "http://claimid.com/",

        googleCacheBaseUrl = "http://webcache.googleusercontent.com/search?q=cache:",

        encodeUrl = function(url) {
            return encodeURI(url);
        },

        dump = function(username) {
            var claimIdUrl = claimIdBaseUrl + username,

                url = googleCacheBaseUrl + encodeUrl(claimIdUrl);

            return url;
        };

    return dump(username);
};

app.get("/dump/", function(request, response, next) {
    function checkAndClean(str, disallowedRx) {
        if (disallowedRx.test(str)) {
            response.send(422);
        }

        return str;
    }

    var username = checkAndClean(request.query.username, /[^\w]/),
        url = getClaimIdCacheUrl(username);

    requestHTTP(url, function(error, responseHTTP, bodyHtml) {
        var $ = cheerio.load(bodyHtml),
            result = JoelPurra.claimIdDump.dump($);

        response.json(result);
    });
});

app.use(express.static(__dirname + '/public'));

app.listen(port, function() {
    console.log("Listening on " + port);
});
"use strict";

/*jslint white: true, todo: true */
/*global require: true, module: true, console: true */

var api,

    dateFormatRx = /\d{4}-\d{2}-\d{2}/;

function Extractor(cheerio) {
    this.$ = cheerio;

    return this;
}

Extractor.prototype.extractLink = function(index, element) {
    var $this = this.$(element),
        $link = $this.find(".taggedlink"),
        who = $this.find(".info_link").text().split("&nbsp;")[0].split("|").map(function(str) {
            return str.trim().split("\n")[0].trim();
        }),
        result = {
            url: $link.attr("href"),
            title: $link.text().trim(),
            tags: $this.find("[rel~=tag]").map(function(index, element) {
                return this.$(element).text();
            }.bind(this)),
            description: $this.find(".public_description").first().text(),
            added: $this.find(".date_added").text().match(dateFormatRx)[0],
            date: $this.find(".date").text(),
            about: who[0],
            by: who[1],
            color: $this.find("a").first().find("img").attr("alt").replace("Star_", "")
        };

    return result;
};

Extractor.prototype.extractGroup = function(index, element) {
    var $this = this.$(element),
        titleHtml = $this.find(".group_header").first().html(),
        result = {
            title: titleHtml.substring(0, titleHtml.indexOf("<")).trim(),
            description: $this.find(".group_description .text").text(),
            links: $this.find(".xfolkentry").map(this.extractLink.bind(this))
        };

    return result;
};

// TODO: split up into reusable and url-specific functionality, and move this function to a subclass
Extractor.prototype.getCachedDate = function() {
    try {
        var div = this.$("div div").first(),
            text = div.text(),
            gmtSplit = text.split("GMT"),
            appearSplit = gmtSplit[0].trim().split("appeared on"),
            dateTimeUtcValue = new Date(appearSplit[1].trim() + " GMT").valueOf();

        return dateTimeUtcValue;
    } catch (e) {
        console.error("Could not parse the cache date.");
    }

    return undefined;
};

// TODO: split up into reusable and url-specific functionality, and move this function to a subclass
Extractor.prototype.getCachedUrl = function() {
    try {
        var url = this.$("div div").first().find("a").first().attr("href");

        return url;
    } catch (e) {
        console.error("Could not parse the cache date.");
    }

    return undefined;
};

Extractor.prototype.dump = function($context) {
    var groups = this.$(".display_group", $context),
        result = {
            cachedUrl: this.getCachedUrl(),
            cachedAt: this.getCachedDate(),
            groups: groups.length === 0 ? undefined : groups.map(this.extractGroup.bind(this))
        };

    return result;
};

api = function(cheerio, $context) {
    var extractor = new Extractor(cheerio),
        dumped = extractor.dump($context);

    return dumped;
};

module.exports = api;
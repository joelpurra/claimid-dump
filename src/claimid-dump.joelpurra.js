/*jslint white: true, todo: true */
/*global jQuery: true */

var JoelPurra = JoelPurra || {};

(function(namespace, pluginName, $) {
    "use strict";

    var dateFormatRx = /\d{4}-\d{2}-\d{2}/,

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
                        }).get(),
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
                    result = {
                        title: $this.find(".group_header")[0].firstChild.data.trim(),
                        description: $this.find(".group_description .text").text(),
                        links: $this.find(".xfolkentry").map(internal.extractLink).get()
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
            dump: internal.dump
        },

        installJQueryExtensions = function() {
            // TODO: use a single public method $("...").claimIdDump("methodname", options) automation, instead of just dump(...)
            var $extension = {},
                $fnExtension = {};

            $extension[pluginName] = plugin.dump;

            $fnExtension[pluginName] = function() {
                return plugin.dump(this);
            };

            $.extend($extension);

            $.fn.extend($fnExtension);
        },

        init = function() {
            namespace[pluginName] = plugin;

            installJQueryExtensions();
        };

    init();

}(JoelPurra, "claimIdDump", jQuery));
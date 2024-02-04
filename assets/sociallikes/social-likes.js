/**
 * Social Likes
 * http://sapegin.github.com/social-likes
 *
 * Sharing buttons for Russian and worldwide social networks.
 * jQuery removed, only requires simple utilities: GET, onDomReady, http_build_query, addListener, removeListener
 *
 * @author Artem Sapegin, Vitaliy Filippov
 * @copyright 2014 Artem Sapegin (sapegin.me), 2016 Vitaliy Filippov
 * @license MIT
 */
/*jshint -W030 */

document.addEventListener("DOMContentLoaded", function () {
  setTimeout(() => {
    (function () {
      "use strict";

      var prefix = "mbr-social-likes";
      var classPrefix = prefix + "__";
      var openClass = prefix + "_opened";
      var protocol = location.protocol === "https:" ? "https:" : "http:";
      var isHttps = protocol === "https:";

      function hasClass(e, cls, remove) {
        var p = -1,
          r = false;
        while ((p = e.className.indexOf(cls, p + 1)) != -1) {
          if (
            (!p || /\s/.exec(e.className.charAt(p - 1))) &&
            (p == e.className.length - cls.length ||
              /\s/.exec(e.className.charAt(p + cls.length)))
          ) {
            r = true;
            if (remove)
              e.className =
                e.className.substr(0, p - 1) +
                e.className.substr(p + cls.length);
          }
        }
        return r;
      }
      function getScript(url, onsuccess, onerror) {
        var node = document.createElement("script");
        node.type = "text/javascript";
        node.src = url;
        node.onreadystatechange = function () {
          if (node.readyState == "complete") onsuccess && onsuccess();
          else if (node.readyState == "loaded") {
            node.children; // IE hack
            if (node.readyState == "loading") onerror && onerror();
          }
          node.parentNode && node.parentNode.removeChild(node);
          node = null;
        };
        node.onload = function () {
          onsuccess && onsuccess();
          node.parentNode && node.parentNode.removeChild(node);
          node = null;
        };
        node.onerror = function () {
          onerror && onerror();
          node.parentNode && node.parentNode.removeChild(node);
          node = null;
        };
        var head = document.head || document.getElementsByTagName("head")[0];
        head.appendChild(node);
      }

      /**
       * Buttons
       */
      var services = {
        facebook: {
          // https://developers.facebook.com/docs/reference/fql/link_stat/
          counterUrl:
            "https://graph.facebook.com/fql?q=SELECT+total_count+FROM+link_stat+WHERE+url%3D%22{url}%22&callback=?",
          convertNumber: function (data) {
            return data.data[0].total_count;
          },
          popupUrl: "https://www.facebook.com/sharer/sharer.php?u={url}",
          popupWidth: 600,
          popupHeight: 359,
        },
        twitter: {
          popupUrl: "https://twitter.com/intent/tweet?url={url}&text={title}",
          popupWidth: 600,
          popupHeight: 250,
          click: function () {
            // Add colon to improve readability
            if (!/[\.\?:\-–—]\s*$/.test(this.options.title))
              this.options.title += ":";
            return true;
          },
        },
        mailru: {
          counterUrl:
            protocol +
            "//connect.mail.ru/share_count?url_list={url}&callback=1&func=?",
          convertNumber: function (data) {
            for (var url in data) {
              if (data.hasOwnProperty(url)) {
                return data[url].shares;
              }
            }
          },
          popupUrl:
            "https://connect.mail.ru/share?share_url={url}&title={title}&image_url={image}",
          popupWidth: 492,
          popupHeight: 500,
        },
        vkontakte: {
          counterUrl:
            "https://vk.com/share.php?act=count&url={url}&index={index}",
          counter: function (jsonUrl, deferred) {
            var options = services.vkontakte;
            if (!options._) {
              options._ = [];
              if (!window.VK) window.VK = {};
              window.VK.Share = {
                count: function (idx, number) {
                  options._[idx].resolve(number);
                },
              };
            }

            var index = options._.length;
            options._.push(deferred);
            getScript(makeUrl(jsonUrl, { index: index }), null, function () {
              deferred.reject();
            });
          },
          popupUrl:
            "https://vk.com/share.php?url={url}&title={title}&image={image}",
          popupWidth: 655,
          popupHeight: 450,
        },
        odnoklassniki: {
          counterUrl:
            protocol +
            "//connect.ok.ru/dk?st.cmd=extLike&ref={url}&uid={index}",
          counter: function (jsonUrl, deferred) {
            var options = services.odnoklassniki;
            if (!options._) {
              options._ = [];
              if (!window.ODKL) window.ODKL = {};
              window.ODKL.updateCount = function (idx, number) {
                if (!idx) return;
                options._[idx].resolve(number);
              };
            }

            var index = options._.length;
            options._.push(deferred);
            getScript(makeUrl(jsonUrl, { index: index }), null, function () {
              deferred.reject();
            });
          },
          popupUrl:
            "https://connect.ok.ru/dk?st.cmd=WidgetSharePreview&service=odnoklassniki&st.shareUrl={url}",
          popupWidth: 580,
          popupHeight: 336,
        },
        plusone: {
          counterUrl:
            protocol + "//share.yandex.ru/gpp.xml?url={url}&callback=?",
          convertNumber: function (number) {
            return parseInt(number.replace(/\D/g, ""), 10);
          },
          popupUrl: "https://plus.google.com/share?url={url}",
          popupWidth: 500,
          popupHeight: 550,
        },
        pinterest: {
          counterUrl:
            protocol +
            "//api.pinterest.com/v1/urls/count.json?url={url}&callback=?",
          convertNumber: function (data) {
            return data.count;
          },
          popupUrl:
            "https://pinterest.com/pin/create/button/?url={url}&description={title}",
          popupWidth: 740,
          popupHeight: 550,
        },
      };

      /**
       * Counters manager
       */
      var counters = {
        promises: {},
        fetch: function (service, url, extraOptions) {
          if (!counters.promises[service]) counters.promises[service] = {};
          var servicePromises = counters.promises[service];

          if (!extraOptions.forceUpdate && servicePromises[url])
            return servicePromises[url];
          else {
            var options = {};
            for (var i in services[service]) options[i] = services[service][i];
            for (i in extraOptions) options[i] = extraOptions[i];
            var deferred = { resolve: function (v) {}, reject: function () {} };
            var jsonUrl =
              options.counterUrl && makeUrl(options.counterUrl, { url: url });

            if (jsonUrl && typeof options.counter == "function")
              options.counter(jsonUrl, deferred);
            else if (options.counterUrl) {
              var cb = function (number) {
                try {
                  if (typeof options.convertNumber == "function")
                    number = options.convertNumber(number);
                  deferred.resolve(number);
                } catch (e) {
                  deferred.reject();
                }
              };
              if (jsonUrl.indexOf("=?") > 0) {
                var k = 0;
                while (window["__jsonp" + k]) k++;
                window["__jsonp" + k] = function (d) {
                  delete window["__jsonp" + k];
                  cb(d);
                };
                jsonUrl = jsonUrl.replace("=?", "=__jsonp" + k);
                getScript(jsonUrl, null, function () {
                  deferred.reject();
                });
              } else {
                GET(jsonUrl, function (r, d) {
                  if (!r.responseText) deferred.reject();
                  else cb(d || r.responseText);
                });
              }
            } else deferred.reject();

            servicePromises[url] = deferred;
            return servicePromises[url];
          }
        },
      };

      /**
       * jQuery plugin
       */
      window.socialLikes = function (element, options) {
        var instance = element["__" + prefix];
        if (instance) {
          if (typeof options == "object") {
            instance.update(options);
          }
        } else {
          var c = {},
            o = dataToOptions(element);
          for (var i in window.socialLikes.defaults)
            c[i] = window.socialLikes.defaults[i];
          for (i in options) c[i] = options[i];
          for (i in o) c[i] = o[i];
          instance = new SocialLikes(element, c);
          element["__" + prefix] = instance;
        }
      };

      function getOg() {
        var h = {};
        var es = document.getElementsByTagName("meta");
        for (var i = 0; i < es.length; i++) {
          var p = es[i].getAttribute("property");
          if (p && p.substr(0, 3) == "og:")
            h[p.substr(3)] = es[i].getAttribute("content");
        }
        return h;
      }

      var og = getOg();
      window.socialLikes.defaults = {
        url: window.location.href.replace(window.location.hash, ""),
        title: og.title || document.title,
        image: og.image,
        counters: true,
        zeroes: false,
        wait: 500, // Show buttons only after counters are ready or after this amount of time
        timeout: 10000, // Show counters after this amount of time even if they aren’t ready
        popupCheckInterval: 500,
        singleTitle: "Share",
      };

      function SocialLikes(container, options) {
        this.container = container;
        this.options = options;
        this.init();
      }

      SocialLikes.prototype = {
        init: function () {
          var self = this;

          // Add class in case of manual initialization
          if (!hasClass(this.container, prefix))
            this.container.className += " " + prefix;

          this.single = hasClass(this.container, prefix + "_single");

          this.initUserButtons();

          this.countersLeft = 0;
          this.number = 0;
          this.container["on_counter." + prefix] = function (e) {
            return self.updateCounter(e);
          };

          this.makeSingleButton();

          this.buttons = [];
          for (var i = 0; i < this.container.children.length; i++) {
            var button = new Button(this.container.children[i], this.options);
            this.buttons.push(button);
            if (button.options.counterUrl) this.countersLeft++;
          }

          if (this.options.counters) {
            this.timer = setTimeout(function () {
              self.appear();
            }, this.options.wait);
            this.timeout = setTimeout(function () {
              self.ready();
            }, this.options.timeout);
          } else this.appear();
        },
        initUserButtons: function () {
          if (!this.userButtonInited && window.socialLikesButtons) {
            for (var i in window.socialLikesButtons) {
              services[i] = services[i] || {};
              for (var j in window.socialLikesButtons[i])
                services[i][j] = window.socialLikesButtons[i][j];
            }
          }
          this.userButtonInited = true;
        },
        makeSingleButton: function () {
          if (!this.single) return;

          var container = this.container;
          container.className += " " + prefix + "_vertical";
          var wrapper = document.createElement("div");
          wrapper.className = prefix + "_single-w";
          container.parentNode.insertBefore(wrapper, container);
          wrapper.appendChild(container);
          var d = document.createElement("div");
          d.className = prefix + "__single-container";
          while (container.firstChild) d.appendChild(container.firstChild);
          container.appendChild(d);

          // Widget
          var widget = document.createElement("div");
          widget.className = getElementClassNames("widget", "single");
          widget.innerHTML =
            '<div class="' +
            getElementClassNames("button", "single") +
            '"><span class="' +
            getElementClassNames("icon", "single") +
            '"></span>' +
            this.options.singleTitle +
            "</div>";
          wrapper.appendChild(widget);

          addListener(widget, "click", function () {
            var activeClass = prefix + "__widget_active";
            if (!hasClass(widget, activeClass, true)) {
              widget.className += " " + activeClass;
              container.style.left =
                (widget.offsetWidth - container.offsetWidth) / 2 + "px";
              container.style.top = -container.offsetHeight + "px";
              showInViewport(container);
              closeOnClick(container, function () {
                hasClass(widget, activeClass, true);
              });
            } else {
              hasClass(container, openClass, true);
            }
            return false;
          });

          this.widget = widget;
        },
        update: function (options) {
          if (!options.forceUpdate && options.url === this.options.url) return;

          // Reset counters
          this.number = 0;
          this.countersLeft = this.buttons.length;
          if (this.widget) {
            var e = this.widget.querySelector("." + prefix + "__counter");
            if (e) e.parentNode.removeChild(e);
          }

          // Update options
          for (var i in options) this.options[i] = options[i];
          for (var buttonIdx = 0; buttonIdx < this.buttons.length; buttonIdx++)
            this.buttons[buttonIdx].update(options);
        },
        updateCounter: function (e, service, number) {
          number = number || 0;

          if (number || this.options.zeroes) {
            this.number += number;
            if (this.single) {
              this.getCounterElem().text(this.number);
            }
          }

          if (this.countersLeft === 0) {
            this.appear();
            this.ready();
          }
          this.countersLeft--;
        },
        appear: function () {
          this.container.className += " " + prefix + "_visible";
        },
        ready: function (silent) {
          if (this.timeout) {
            clearTimeout(this.timeout);
          }
          this.container.className += " " + prefix + "_ready";
          if (!silent) {
            var e = this.container["on_ready." + prefix];
            if (e) e(this.number);
          }
        },
        getCounterElem: function () {
          var counterElem = this.widget.querySelector(
            "." + classPrefix + "counter_single"
          );
          if (!counterElem.length) {
            counterElem = document.createElement("span");
            counterElem.className = getElementClassNames("counter", "single");
            this.widget.append(counterElem);
          }
          return counterElem;
        },
      };

      function Button(widget, options) {
        this.widget = widget;
        this.options = {};
        for (var i in options) this.options[i] = options[i];
        this.detectService();
        if (this.service) {
          this.init();
        }
      }

      Button.prototype = {
        init: function () {
          this.detectParams();
          this.initHtml();
          var self = this;
          setTimeout(function () {
            self.initCounter();
          }, 0);
        },

        update: function (options) {
          this.options.forceUpdate = false;
          for (var i in options) this.options[i] = options[i];
          var e = this.widget.querySelector("." + prefix + "__counter");
          if (e) e.parentNode.removeChild(e); // Remove old counter
          this.initCounter();
        },

        detectService: function () {
          var service = this.widget.getAttribute("data-service");
          if (!service) {
            // class="facebook"
            var classes =
              this.widget.classList || this.widget.className.split(" ");
            for (var classIdx = 0; classIdx < classes.length; classIdx++) {
              var cls = classes[classIdx];
              if (services[cls]) {
                service = cls;
                break;
              }
            }
            if (!service) return;
          }
          this.service = service;
          for (var i in services[service])
            this.options[i] = services[service][i];
        },

        detectParams: function () {
          // Custom page counter URL or number
          var c = this.widget.getAttribute("data-counter");
          if (c) {
            var number = parseInt(c, 10);
            if (isNaN(number)) this.options.counterUrl = c;
            else this.options.counterNumber = number;
          }

          // Custom page title
          c = this.widget.getAttribute("data-title");
          if (c) this.options.title = c;

          // Custom page URL
          c = this.widget.getAttribute("data-url");
          if (c) this.options.url = c;
        },

        initHtml: function () {
          var self = this;
          var options = this.options;
          var widget = this.widget;

          // Old initialization HTML
          var a = widget.querySelector("a");
          if (a) this.cloneDataAttrs(a, widget);

          // Button
          var button = document.createElement("span");
          button.className = this.getElementClassNames("button");
          button.innerHTML = widget.innerHTML;
          if (options.clickUrl) {
            var url = makeUrl(options.clickUrl, {
              url: options.url,
              title: options.title,
              image: options.image || "",
            });
            var link = document.createElement("a");
            link.href = url;
            this.cloneDataAttrs(widget, link);
            widget.parentNode.insertBefore(link, widget);
            widget.parentNode.removeChild(widget);
            this.widget = widget = link;
          } else {
            widget.addEventListener("click", function () {
              self.click();
            });
          }

          widget.className =
            widget.className.replace(" " + this.service, "") +
            " " +
            this.getElementClassNames("widget");

          // Icon
          var s = document.createElement("span");
          s.className = this.getElementClassNames("icon");
          button.children.length
            ? button.insertBefore(s, button.firstChild)
            : button.appendChild(s);

          widget.innerHTML = "";
          widget.appendChild(button);
          this.button = button;
        },

        initCounter: function () {
          if (this.options.counters) {
            if (this.options.counterNumber) {
              this.updateCounter(this.options.counterNumber);
            } else {
              var extraOptions = {
                counterUrl: this.options.counterUrl,
                forceUpdate: this.options.forceUpdate,
              };
              var self = this;
              var r = counters.fetch(
                this.service,
                this.options.url,
                extraOptions
              );
              r.reject = r.resolve = function (n) {
                self.updateCounter(n);
              };
            }
          }
        },

        cloneDataAttrs: function (source, destination) {
          for (var i = 0; i < source.attributes.length; i++)
            if (source.attributes[i].name.substr(0, 5) == "data-")
              destination.setAttribute(
                source.attributes[i].name,
                source.attributes[i].value
              );
        },

        getElementClassNames: function (elem) {
          return getElementClassNames(elem, this.service);
        },

        updateCounter: function (number) {
          number = parseInt(number, 10) || 0;

          var counterElem = document.createElement("span");
          if (!number && !this.options.zeroes)
            counterElem.className =
              this.getElementClassNames("counter") +
              " " +
              prefix +
              "__counter_empty";
          else {
            counterElem.innerHTML = number;
            counterElem.className = this.getElementClassNames("counter");
          }
          this.widget.appendChild(counterElem);

          var e = this.widget["on_counter." + prefix];
          if (e) e([this.service, number]);
        },

        click: function (e) {
          var options = this.options;
          var process = true;
          if (typeof options.click == "function") {
            process = options.click.call(this, e);
          }
          if (process) {
            var url = makeUrl(options.popupUrl, {
              url: options.url,
              title: options.title,
              image: options.image || "",
            });
            url = this.addAdditionalParamsToUrl(url);
            this.openPopup(url, {
              width: options.popupWidth,
              height: options.popupHeight,
            });
          }
          return false;
        },

        addAdditionalParamsToUrl: function (url) {
          var params = dataToOptions(this.widget);
          for (var i in this.options.data) params[i] = this.options.data[i];
          var s = "";
          for (i in params)
            s +=
              "&" + encodeURIComponent(i) + "=" + encodeURIComponent(params[i]);
          if (!s) return url;
          if (!url.indexOf("?")) s = "?" + s.substr(1);
          return url + s;
        },

        openPopup: function (url, params) {
          var left = Math.round(screen.width / 2 - params.width / 2);
          var top = 0;
          if (screen.height > params.height) {
            top = Math.round(screen.height / 3 - params.height / 2);
          }

          var win = window.open(
            url,
            "sl_" + this.service,
            "left=" +
              left +
              ",top=" +
              top +
              "," +
              "width=" +
              params.width +
              ",height=" +
              params.height +
              ",personalbar=0,toolbar=0,scrollbars=1,resizable=1"
          );
          if (win) {
            win.focus();
            var e = this.widget["on_popup_opened." + prefix];
            if (e) e([this.service, win]);
            var self = this;
            var timer = setInterval(function () {
              if (!win.closed) return;
              clearInterval(timer);
              var e = self.widget["on_popup_closed." + prefix];
              if (e) e(self.service);
            }, this.options.popupCheckInterval);
          } else {
            location.href = url;
          }
        },
      };

      /**
       * Helpers
       */

      // Camelize data-attributes
      function dataToOptions(elem, nocamel) {
        function upper(m, l) {
          return l.toUpper();
        }
        var options = {};
        for (var i = 0; i < elem.attributes.length; i++) {
          var key = elem.attributes[i].name;
          if (key.substr(0, 5) == "data-") {
            key = key.substr(5);
            var value = elem.attributes[i].value;
            if (value === "yes") value = true;
            else if (value === "no") value = false;
            options[nocamel ? key : key.replace(/-(\w)/g, upper)] = value;
          }
        }
        return options;
      }

      function makeUrl(url, context) {
        return template(url, context, encodeURIComponent);
      }

      function template(tmpl, context, filter) {
        return tmpl.replace(/\{([^\}]+)\}/g, function (m, key) {
          // If key doesn't exists in the context we should keep template tag as is
          return key in context
            ? filter
              ? filter(context[key])
              : context[key]
            : m;
        });
      }

      function getElementClassNames(elem, mod) {
        var cls = classPrefix + elem;
        return cls + " " + cls + "_" + mod;
      }

      function closeOnClick(elem, callback) {
        function handler(e) {
          if (e.type === "keydown" && e.which !== 27) return;
          for (var i = e; i && i != elem; i = i.parentNode) {}
          if (i == elem) return;
          hasClass(elem, openClass, true);
          removeListener(document, "click", handler);
          removeListener(document, "touchstart", handler);
          removeListener(document, "keydown", handler);
          callback();
        }
        var events = "click touchstart keydown";
        addListener(document, "click", handler);
        addListener(document, "touchstart", handler);
        addListener(document, "keydown", handler);
      }

      function showInViewport(elem) {
        var offset = 10;
        if (document.documentElement.getBoundingClientRect) {
          var left = parseInt(elem.style.left, 10);
          var top = parseInt(elem.style.top, 10);

          var rect = elem[0].getBoundingClientRect();
          if (rect.left < offset)
            elem.stype.left = offset - rect.left + left + "px";
          else if (rect.right > window.innerWidth - offset)
            elem.style.left =
              window.innerWidth - rect.right - offset + left + "px";

          if (rect.top < offset)
            elem.style.top = offset - rect.top + top + "px";
          else if (rect.bottom > window.innerHeight - offset)
            elem.style.top =
              window.innerHeight - rect.bottom - offset + top + "px";
        }
        elem.className += " " + openClass;
      }

      /**
       * Auto initialization
       */
      var es = document.querySelectorAll("." + prefix);
      for (var i = 0; i < es.length; i++) window.socialLikes(es[i]);
    })();
  }, 2000);
});

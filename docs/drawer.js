var drawer = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function create_slot(definition, ctx, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, fn) {
        return definition[1]
            ? assign({}, assign(ctx.$$scope.ctx, definition[1](fn ? fn(ctx) : {})))
            : ctx.$$scope.ctx;
    }
    function get_slot_changes(definition, ctx, changed, fn) {
        return definition[1]
            ? assign({}, assign(ctx.$$scope.changed || {}, definition[1](fn ? fn(changed) : {})))
            : ctx.$$scope.changed || {};
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        for (const key in attributes) {
            if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key in node) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function afterUpdate(fn) {
        get_current_component().$$.after_render.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = current_component;
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_binding_callback(fn) {
        binding_callbacks.push(fn);
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.shift()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            while (render_callbacks.length) {
                const callback = render_callbacks.pop();
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_render);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_render.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            remaining: 0,
            callbacks: []
        };
    }
    function check_outros() {
        if (!outros.remaining) {
            run_all(outros.callbacks);
        }
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.callbacks.push(() => {
                outroing.delete(block);
                if (callback) {
                    block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_render } = component.$$;
        fragment.m(target, anchor);
        // onMount happens after the initial afterUpdate. Because
        // afterUpdate callbacks happen in reverse order (inner first)
        // we schedule onMount callbacks before afterUpdate callbacks
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_render.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        if (component.$$.fragment) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal$$1, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
            update: noop,
            not_equal: not_equal$$1,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_render: [],
            after_render: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, value) => {
                if ($$.ctx && not_equal$$1($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_render);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    var candidateSelectors = [
      'input',
      'select',
      'textarea',
      'a[href]',
      'button',
      '[tabindex]',
      'audio[controls]',
      'video[controls]',
      '[contenteditable]:not([contenteditable="false"])',
    ];
    var candidateSelector = candidateSelectors.join(',');

    var matches = typeof Element === 'undefined'
      ? function () {}
      : Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;

    function tabbable(el, options) {
      options = options || {};

      var regularTabbables = [];
      var orderedTabbables = [];

      var candidates = el.querySelectorAll(candidateSelector);

      if (options.includeContainer) {
        if (matches.call(el, candidateSelector)) {
          candidates = Array.prototype.slice.apply(candidates);
          candidates.unshift(el);
        }
      }

      var i, candidate, candidateTabindex;
      for (i = 0; i < candidates.length; i++) {
        candidate = candidates[i];

        if (!isNodeMatchingSelectorTabbable(candidate)) continue;

        candidateTabindex = getTabindex(candidate);
        if (candidateTabindex === 0) {
          regularTabbables.push(candidate);
        } else {
          orderedTabbables.push({
            documentOrder: i,
            tabIndex: candidateTabindex,
            node: candidate,
          });
        }
      }

      var tabbableNodes = orderedTabbables
        .sort(sortOrderedTabbables)
        .map(function(a) { return a.node })
        .concat(regularTabbables);

      return tabbableNodes;
    }

    tabbable.isTabbable = isTabbable;
    tabbable.isFocusable = isFocusable;

    function isNodeMatchingSelectorTabbable(node) {
      if (
        !isNodeMatchingSelectorFocusable(node)
        || isNonTabbableRadio(node)
        || getTabindex(node) < 0
      ) {
        return false;
      }
      return true;
    }

    function isTabbable(node) {
      if (!node) throw new Error('No node provided');
      if (matches.call(node, candidateSelector) === false) return false;
      return isNodeMatchingSelectorTabbable(node);
    }

    function isNodeMatchingSelectorFocusable(node) {
      if (
        node.disabled
        || isHiddenInput(node)
        || isHidden(node)
      ) {
        return false;
      }
      return true;
    }

    var focusableCandidateSelector = candidateSelectors.concat('iframe').join(',');
    function isFocusable(node) {
      if (!node) throw new Error('No node provided');
      if (matches.call(node, focusableCandidateSelector) === false) return false;
      return isNodeMatchingSelectorFocusable(node);
    }

    function getTabindex(node) {
      var tabindexAttr = parseInt(node.getAttribute('tabindex'), 10);
      if (!isNaN(tabindexAttr)) return tabindexAttr;
      // Browsers do not return `tabIndex` correctly for contentEditable nodes;
      // so if they don't have a tabindex attribute specifically set, assume it's 0.
      if (isContentEditable(node)) return 0;
      return node.tabIndex;
    }

    function sortOrderedTabbables(a, b) {
      return a.tabIndex === b.tabIndex ? a.documentOrder - b.documentOrder : a.tabIndex - b.tabIndex;
    }

    function isContentEditable(node) {
      return node.contentEditable === 'true';
    }

    function isInput(node) {
      return node.tagName === 'INPUT';
    }

    function isHiddenInput(node) {
      return isInput(node) && node.type === 'hidden';
    }

    function isRadio(node) {
      return isInput(node) && node.type === 'radio';
    }

    function isNonTabbableRadio(node) {
      return isRadio(node) && !isTabbableRadio(node);
    }

    function getCheckedRadio(nodes) {
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].checked) {
          return nodes[i];
        }
      }
    }

    function isTabbableRadio(node) {
      if (!node.name) return true;
      // This won't account for the edge case where you have radio groups with the same
      // in separate forms on the same page.
      var radioSet = node.ownerDocument.querySelectorAll('input[type="radio"][name="' + node.name + '"]');
      var checked = getCheckedRadio(radioSet);
      return !checked || checked === node;
    }

    function isHidden(node) {
      // offsetParent being null will allow detecting cases where an element is invisible or inside an invisible element,
      // as long as the element does not use position: fixed. For them, their visibility has to be checked directly as well.
      return node.offsetParent === null || getComputedStyle(node).visibility === 'hidden';
    }

    var D__work_svelte3_svelteMdc_node_modules_tabbable = tabbable;

    var immutable = extend;

    var hasOwnProperty = Object.prototype.hasOwnProperty;

    function extend() {
        var target = {};

        for (var i = 0; i < arguments.length; i++) {
            var source = arguments[i];

            for (var key in source) {
                if (hasOwnProperty.call(source, key)) {
                    target[key] = source[key];
                }
            }
        }

        return target
    }

    var activeFocusDelay;

    var activeFocusTraps = (function() {
      var trapQueue = [];
      return {
        activateTrap: function(trap) {
          if (trapQueue.length > 0) {
            var activeTrap = trapQueue[trapQueue.length - 1];
            if (activeTrap !== trap) {
              activeTrap.pause();
            }
          }

          var trapIndex = trapQueue.indexOf(trap);
          if (trapIndex === -1) {
            trapQueue.push(trap);
          } else {
            // move this existing trap to the front of the queue
            trapQueue.splice(trapIndex, 1);
            trapQueue.push(trap);
          }
        },

        deactivateTrap: function(trap) {
          var trapIndex = trapQueue.indexOf(trap);
          if (trapIndex !== -1) {
            trapQueue.splice(trapIndex, 1);
          }

          if (trapQueue.length > 0) {
            trapQueue[trapQueue.length - 1].unpause();
          }
        }
      };
    })();

    function focusTrap(element, userOptions) {
      var doc = document;
      var container =
        typeof element === 'string' ? doc.querySelector(element) : element;

      var config = immutable(
        {
          returnFocusOnDeactivate: true,
          escapeDeactivates: true
        },
        userOptions
      );

      var state = {
        firstTabbableNode: null,
        lastTabbableNode: null,
        nodeFocusedBeforeActivation: null,
        mostRecentlyFocusedNode: null,
        active: false,
        paused: false
      };

      var trap = {
        activate: activate,
        deactivate: deactivate,
        pause: pause,
        unpause: unpause
      };

      return trap;

      function activate(activateOptions) {
        if (state.active) return;

        updateTabbableNodes();

        state.active = true;
        state.paused = false;
        state.nodeFocusedBeforeActivation = doc.activeElement;

        var onActivate =
          activateOptions && activateOptions.onActivate
            ? activateOptions.onActivate
            : config.onActivate;
        if (onActivate) {
          onActivate();
        }

        addListeners();
        return trap;
      }

      function deactivate(deactivateOptions) {
        if (!state.active) return;

        clearTimeout(activeFocusDelay);

        removeListeners();
        state.active = false;
        state.paused = false;

        activeFocusTraps.deactivateTrap(trap);

        var onDeactivate =
          deactivateOptions && deactivateOptions.onDeactivate !== undefined
            ? deactivateOptions.onDeactivate
            : config.onDeactivate;
        if (onDeactivate) {
          onDeactivate();
        }

        var returnFocus =
          deactivateOptions && deactivateOptions.returnFocus !== undefined
            ? deactivateOptions.returnFocus
            : config.returnFocusOnDeactivate;
        if (returnFocus) {
          delay(function() {
            tryFocus(state.nodeFocusedBeforeActivation);
          });
        }

        return trap;
      }

      function pause() {
        if (state.paused || !state.active) return;
        state.paused = true;
        removeListeners();
      }

      function unpause() {
        if (!state.paused || !state.active) return;
        state.paused = false;
        updateTabbableNodes();
        addListeners();
      }

      function addListeners() {
        if (!state.active) return;

        // There can be only one listening focus trap at a time
        activeFocusTraps.activateTrap(trap);

        // Delay ensures that the focused element doesn't capture the event
        // that caused the focus trap activation.
        activeFocusDelay = delay(function() {
          tryFocus(getInitialFocusNode());
        });

        doc.addEventListener('focusin', checkFocusIn, true);
        doc.addEventListener('mousedown', checkPointerDown, {
          capture: true,
          passive: false
        });
        doc.addEventListener('touchstart', checkPointerDown, {
          capture: true,
          passive: false
        });
        doc.addEventListener('click', checkClick, {
          capture: true,
          passive: false
        });
        doc.addEventListener('keydown', checkKey, {
          capture: true,
          passive: false
        });

        return trap;
      }

      function removeListeners() {
        if (!state.active) return;

        doc.removeEventListener('focusin', checkFocusIn, true);
        doc.removeEventListener('mousedown', checkPointerDown, true);
        doc.removeEventListener('touchstart', checkPointerDown, true);
        doc.removeEventListener('click', checkClick, true);
        doc.removeEventListener('keydown', checkKey, true);

        return trap;
      }

      function getNodeForOption(optionName) {
        var optionValue = config[optionName];
        var node = optionValue;
        if (!optionValue) {
          return null;
        }
        if (typeof optionValue === 'string') {
          node = doc.querySelector(optionValue);
          if (!node) {
            throw new Error('`' + optionName + '` refers to no known node');
          }
        }
        if (typeof optionValue === 'function') {
          node = optionValue();
          if (!node) {
            throw new Error('`' + optionName + '` did not return a node');
          }
        }
        return node;
      }

      function getInitialFocusNode() {
        var node;
        if (getNodeForOption('initialFocus') !== null) {
          node = getNodeForOption('initialFocus');
        } else if (container.contains(doc.activeElement)) {
          node = doc.activeElement;
        } else {
          node = state.firstTabbableNode || getNodeForOption('fallbackFocus');
        }

        if (!node) {
          throw new Error(
            "You can't have a focus-trap without at least one focusable element"
          );
        }

        return node;
      }

      // This needs to be done on mousedown and touchstart instead of click
      // so that it precedes the focus event.
      function checkPointerDown(e) {
        if (container.contains(e.target)) return;
        if (config.clickOutsideDeactivates) {
          deactivate({
            returnFocus: !D__work_svelte3_svelteMdc_node_modules_tabbable.isFocusable(e.target)
          });
        } else {
          e.preventDefault();
        }
      }

      // In case focus escapes the trap for some strange reason, pull it back in.
      function checkFocusIn(e) {
        // In Firefox when you Tab out of an iframe the Document is briefly focused.
        if (container.contains(e.target) || e.target instanceof Document) {
          return;
        }
        e.stopImmediatePropagation();
        tryFocus(state.mostRecentlyFocusedNode || getInitialFocusNode());
      }

      function checkKey(e) {
        if (config.escapeDeactivates !== false && isEscapeEvent(e)) {
          e.preventDefault();
          deactivate();
          return;
        }
        if (isTabEvent(e)) {
          checkTab(e);
          return;
        }
      }

      // Hijack Tab events on the first and last focusable nodes of the trap,
      // in order to prevent focus from escaping. If it escapes for even a
      // moment it can end up scrolling the page and causing confusion so we
      // kind of need to capture the action at the keydown phase.
      function checkTab(e) {
        updateTabbableNodes();
        if (e.shiftKey && e.target === state.firstTabbableNode) {
          e.preventDefault();
          tryFocus(state.lastTabbableNode);
          return;
        }
        if (!e.shiftKey && e.target === state.lastTabbableNode) {
          e.preventDefault();
          tryFocus(state.firstTabbableNode);
          return;
        }
      }

      function checkClick(e) {
        if (config.clickOutsideDeactivates) return;
        if (container.contains(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      }

      function updateTabbableNodes() {
        var tabbableNodes = D__work_svelte3_svelteMdc_node_modules_tabbable(container);
        state.firstTabbableNode = tabbableNodes[0] || getInitialFocusNode();
        state.lastTabbableNode =
          tabbableNodes[tabbableNodes.length - 1] || getInitialFocusNode();
      }

      function tryFocus(node) {
        if (node === doc.activeElement) return;
        if (!node || !node.focus) {
          tryFocus(getInitialFocusNode());
          return;
        }

        node.focus();
        state.mostRecentlyFocusedNode = node;
        if (isSelectableInput(node)) {
          node.select();
        }
      }
    }

    function isSelectableInput(node) {
      return (
        node.tagName &&
        node.tagName.toLowerCase() === 'input' &&
        typeof node.select === 'function'
      );
    }

    function isEscapeEvent(e) {
      return e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27;
    }

    function isTabEvent(e) {
      return e.key === 'Tab' || e.keyCode === 9;
    }

    function delay(fn) {
      return setTimeout(fn, 0);
    }

    var focusTrap_1 = focusTrap;

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    function createFocusTrapInstance(surfaceEl, focusTrapFactory) {
        if (focusTrapFactory === void 0) { focusTrapFactory = focusTrap_1; }
        return focusTrapFactory(surfaceEl, {
            clickOutsideDeactivates: true,
            escapeDeactivates: false,
            initialFocus: undefined,
            returnFocusOnDeactivate: false,
        });
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function __read(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    function __spread() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read(arguments[i]));
        return ar;
    }

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCFoundation = /** @class */ (function () {
        function MDCFoundation(adapter) {
            if (adapter === void 0) { adapter = {}; }
            this.adapter_ = adapter;
        }
        Object.defineProperty(MDCFoundation, "cssClasses", {
            get: function () {
                // Classes extending MDCFoundation should implement this method to return an object which exports every
                // CSS class the foundation class needs as a property. e.g. {ACTIVE: 'mdc-component--active'}
                return {};
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFoundation, "strings", {
            get: function () {
                // Classes extending MDCFoundation should implement this method to return an object which exports all
                // semantic strings as constants. e.g. {ARIA_ROLE: 'tablist'}
                return {};
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFoundation, "numbers", {
            get: function () {
                // Classes extending MDCFoundation should implement this method to return an object which exports all
                // of its semantic numbers as constants. e.g. {ANIMATION_DELAY_MS: 350}
                return {};
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFoundation, "defaultAdapter", {
            get: function () {
                // Classes extending MDCFoundation may choose to implement this getter in order to provide a convenient
                // way of viewing the necessary methods of an adapter. In the future, this could also be used for adapter
                // validation.
                return {};
            },
            enumerable: true,
            configurable: true
        });
        MDCFoundation.prototype.init = function () {
            // Subclasses should override this method to perform initialization routines (registering events, etc.)
        };
        MDCFoundation.prototype.destroy = function () {
            // Subclasses should override this method to perform de-initialization routines (de-registering events, etc.)
        };
        return MDCFoundation;
    }());

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCComponent = /** @class */ (function () {
        function MDCComponent(root, foundation) {
            var args = [];
            for (var _i = 2; _i < arguments.length; _i++) {
                args[_i - 2] = arguments[_i];
            }
            this.root_ = root;
            this.initialize.apply(this, __spread(args));
            // Note that we initialize foundation here and not within the constructor's default param so that
            // this.root_ is defined and can be used within the foundation class.
            this.foundation_ = foundation === undefined ? this.getDefaultFoundation() : foundation;
            this.foundation_.init();
            this.initialSyncWithDOM();
        }
        MDCComponent.attachTo = function (root) {
            // Subclasses which extend MDCBase should provide an attachTo() method that takes a root element and
            // returns an instantiated component with its root set to that element. Also note that in the cases of
            // subclasses, an explicit foundation class will not have to be passed in; it will simply be initialized
            // from getDefaultFoundation().
            return new MDCComponent(root, new MDCFoundation({}));
        };
        /* istanbul ignore next: method param only exists for typing purposes; it does not need to be unit tested */
        MDCComponent.prototype.initialize = function () {
            var _args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                _args[_i] = arguments[_i];
            }
            // Subclasses can override this to do any additional setup work that would be considered part of a
            // "constructor". Essentially, it is a hook into the parent constructor before the foundation is
            // initialized. Any additional arguments besides root and foundation will be passed in here.
        };
        MDCComponent.prototype.getDefaultFoundation = function () {
            // Subclasses must override this method to return a properly configured foundation class for the
            // component.
            throw new Error('Subclasses must override getDefaultFoundation to return a properly configured ' +
                'foundation class');
        };
        MDCComponent.prototype.initialSyncWithDOM = function () {
            // Subclasses should override this method if they need to perform work to synchronize with a host DOM
            // object. An example of this would be a form control wrapper that needs to synchronize its internal state
            // to some property or attribute of the host DOM. Please note: this is *not* the place to perform DOM
            // reads/writes that would cause layout / paint, as this is called synchronously from within the constructor.
        };
        MDCComponent.prototype.destroy = function () {
            // Subclasses may implement this method to release any resources / deregister any listeners they have
            // attached. An example of this might be deregistering a resize event from the window object.
            this.foundation_.destroy();
        };
        MDCComponent.prototype.listen = function (evtType, handler) {
            this.root_.addEventListener(evtType, handler);
        };
        MDCComponent.prototype.unlisten = function (evtType, handler) {
            this.root_.removeEventListener(evtType, handler);
        };
        /**
         * Fires a cross-browser-compatible custom event from the component root of the given type, with the given data.
         */
        MDCComponent.prototype.emit = function (evtType, evtData, shouldBubble) {
            if (shouldBubble === void 0) { shouldBubble = false; }
            var evt;
            if (typeof CustomEvent === 'function') {
                evt = new CustomEvent(evtType, {
                    bubbles: shouldBubble,
                    detail: evtData,
                });
            }
            else {
                evt = document.createEvent('CustomEvent');
                evt.initCustomEvent(evtType, shouldBubble, false, evtData);
            }
            this.root_.dispatchEvent(evt);
        };
        return MDCComponent;
    }());

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    /**
     * @fileoverview A "ponyfill" is a polyfill that doesn't modify the global prototype chain.
     * This makes ponyfills safer than traditional polyfills, especially for libraries like MDC.
     */
    function closest(element, selector) {
        if (element.closest) {
            return element.closest(selector);
        }
        var el = element;
        while (el) {
            if (matches$1(el, selector)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }
    function matches$1(element, selector) {
        var nativeMatches = element.matches
            || element.webkitMatchesSelector
            || element.msMatchesSelector;
        return nativeMatches.call(element, selector);
    }

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses = {
        LIST_ITEM_ACTIVATED_CLASS: 'mdc-list-item--activated',
        LIST_ITEM_CLASS: 'mdc-list-item',
        LIST_ITEM_DISABLED_CLASS: 'mdc-list-item--disabled',
        LIST_ITEM_SELECTED_CLASS: 'mdc-list-item--selected',
        ROOT: 'mdc-list',
    };
    var strings = {
        ACTION_EVENT: 'MDCList:action',
        ARIA_CHECKED: 'aria-checked',
        ARIA_CHECKED_CHECKBOX_SELECTOR: '[role="checkbox"][aria-checked="true"]',
        ARIA_CHECKED_RADIO_SELECTOR: '[role="radio"][aria-checked="true"]',
        ARIA_CURRENT: 'aria-current',
        ARIA_ORIENTATION: 'aria-orientation',
        ARIA_ORIENTATION_HORIZONTAL: 'horizontal',
        ARIA_ROLE_CHECKBOX_SELECTOR: '[role="checkbox"]',
        ARIA_SELECTED: 'aria-selected',
        CHECKBOX_RADIO_SELECTOR: 'input[type="checkbox"]:not(:disabled), input[type="radio"]:not(:disabled)',
        CHECKBOX_SELECTOR: 'input[type="checkbox"]:not(:disabled)',
        CHILD_ELEMENTS_TO_TOGGLE_TABINDEX: "\n    ." + cssClasses.LIST_ITEM_CLASS + " button:not(:disabled),\n    ." + cssClasses.LIST_ITEM_CLASS + " a\n  ",
        FOCUSABLE_CHILD_ELEMENTS: "\n    ." + cssClasses.LIST_ITEM_CLASS + " button:not(:disabled),\n    ." + cssClasses.LIST_ITEM_CLASS + " a,\n    ." + cssClasses.LIST_ITEM_CLASS + " input[type=\"radio\"]:not(:disabled),\n    ." + cssClasses.LIST_ITEM_CLASS + " input[type=\"checkbox\"]:not(:disabled)\n  ",
        RADIO_SELECTOR: 'input[type="radio"]:not(:disabled)',
    };
    var numbers = {
        UNSET_INDEX: -1,
    };

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var ELEMENTS_KEY_ALLOWED_IN = ['input', 'button', 'textarea', 'select'];
    function isNumberArray(selectedIndex) {
        return selectedIndex instanceof Array;
    }
    var MDCListFoundation = /** @class */ (function (_super) {
        __extends(MDCListFoundation, _super);
        function MDCListFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCListFoundation.defaultAdapter, adapter)) || this;
            _this.wrapFocus_ = false;
            _this.isVertical_ = true;
            _this.isSingleSelectionList_ = false;
            _this.selectedIndex_ = numbers.UNSET_INDEX;
            _this.focusedItemIndex_ = numbers.UNSET_INDEX;
            _this.useActivatedClass_ = false;
            _this.ariaCurrentAttrValue_ = null;
            _this.isCheckboxList_ = false;
            _this.isRadioList_ = false;
            return _this;
        }
        Object.defineProperty(MDCListFoundation, "strings", {
            get: function () {
                return strings;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCListFoundation, "cssClasses", {
            get: function () {
                return cssClasses;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCListFoundation, "numbers", {
            get: function () {
                return numbers;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCListFoundation, "defaultAdapter", {
            get: function () {
                return {
                    addClassForElementIndex: function () { return undefined; },
                    focusItemAtIndex: function () { return undefined; },
                    getAttributeForElementIndex: function () { return null; },
                    getFocusedElementIndex: function () { return 0; },
                    getListItemCount: function () { return 0; },
                    hasCheckboxAtIndex: function () { return false; },
                    hasRadioAtIndex: function () { return false; },
                    isCheckboxCheckedAtIndex: function () { return false; },
                    isFocusInsideList: function () { return false; },
                    isRootFocused: function () { return false; },
                    notifyAction: function () { return undefined; },
                    removeClassForElementIndex: function () { return undefined; },
                    setAttributeForElementIndex: function () { return undefined; },
                    setCheckedCheckboxOrRadioAtIndex: function () { return undefined; },
                    setTabIndexForListItemChildren: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCListFoundation.prototype.layout = function () {
            if (this.adapter_.getListItemCount() === 0) {
                return;
            }
            if (this.adapter_.hasCheckboxAtIndex(0)) {
                this.isCheckboxList_ = true;
            }
            else if (this.adapter_.hasRadioAtIndex(0)) {
                this.isRadioList_ = true;
            }
        };
        /**
         * Sets the private wrapFocus_ variable.
         */
        MDCListFoundation.prototype.setWrapFocus = function (value) {
            this.wrapFocus_ = value;
        };
        /**
         * Sets the isVertical_ private variable.
         */
        MDCListFoundation.prototype.setVerticalOrientation = function (value) {
            this.isVertical_ = value;
        };
        /**
         * Sets the isSingleSelectionList_ private variable.
         */
        MDCListFoundation.prototype.setSingleSelection = function (value) {
            this.isSingleSelectionList_ = value;
        };
        /**
         * Sets the useActivatedClass_ private variable.
         */
        MDCListFoundation.prototype.setUseActivatedClass = function (useActivated) {
            this.useActivatedClass_ = useActivated;
        };
        MDCListFoundation.prototype.getSelectedIndex = function () {
            return this.selectedIndex_;
        };
        MDCListFoundation.prototype.setSelectedIndex = function (index) {
            if (!this.isIndexValid_(index)) {
                return;
            }
            if (this.isCheckboxList_) {
                this.setCheckboxAtIndex_(index);
            }
            else if (this.isRadioList_) {
                this.setRadioAtIndex_(index);
            }
            else {
                this.setSingleSelectionAtIndex_(index);
            }
        };
        /**
         * Focus in handler for the list items.
         */
        MDCListFoundation.prototype.handleFocusIn = function (_, listItemIndex) {
            if (listItemIndex >= 0) {
                this.adapter_.setTabIndexForListItemChildren(listItemIndex, '0');
            }
        };
        /**
         * Focus out handler for the list items.
         */
        MDCListFoundation.prototype.handleFocusOut = function (_, listItemIndex) {
            var _this = this;
            if (listItemIndex >= 0) {
                this.adapter_.setTabIndexForListItemChildren(listItemIndex, '-1');
            }
            /**
             * Between Focusout & Focusin some browsers do not have focus on any element. Setting a delay to wait till the focus
             * is moved to next element.
             */
            setTimeout(function () {
                if (!_this.adapter_.isFocusInsideList()) {
                    _this.setTabindexToFirstSelectedItem_();
                }
            }, 0);
        };
        /**
         * Key handler for the list.
         */
        MDCListFoundation.prototype.handleKeydown = function (evt, isRootListItem, listItemIndex) {
            var isArrowLeft = evt.key === 'ArrowLeft' || evt.keyCode === 37;
            var isArrowUp = evt.key === 'ArrowUp' || evt.keyCode === 38;
            var isArrowRight = evt.key === 'ArrowRight' || evt.keyCode === 39;
            var isArrowDown = evt.key === 'ArrowDown' || evt.keyCode === 40;
            var isHome = evt.key === 'Home' || evt.keyCode === 36;
            var isEnd = evt.key === 'End' || evt.keyCode === 35;
            var isEnter = evt.key === 'Enter' || evt.keyCode === 13;
            var isSpace = evt.key === 'Space' || evt.keyCode === 32;
            if (this.adapter_.isRootFocused()) {
                if (isArrowUp || isEnd) {
                    evt.preventDefault();
                    this.focusLastElement();
                }
                else if (isArrowDown || isHome) {
                    evt.preventDefault();
                    this.focusFirstElement();
                }
                return;
            }
            var currentIndex = this.adapter_.getFocusedElementIndex();
            if (currentIndex === -1) {
                currentIndex = listItemIndex;
                if (currentIndex < 0) {
                    // If this event doesn't have a mdc-list-item ancestor from the
                    // current list (not from a sublist), return early.
                    return;
                }
            }
            var nextIndex;
            if ((this.isVertical_ && isArrowDown) || (!this.isVertical_ && isArrowRight)) {
                this.preventDefaultEvent_(evt);
                nextIndex = this.focusNextElement(currentIndex);
            }
            else if ((this.isVertical_ && isArrowUp) || (!this.isVertical_ && isArrowLeft)) {
                this.preventDefaultEvent_(evt);
                nextIndex = this.focusPrevElement(currentIndex);
            }
            else if (isHome) {
                this.preventDefaultEvent_(evt);
                nextIndex = this.focusFirstElement();
            }
            else if (isEnd) {
                this.preventDefaultEvent_(evt);
                nextIndex = this.focusLastElement();
            }
            else if (isEnter || isSpace) {
                if (isRootListItem) {
                    // Return early if enter key is pressed on anchor element which triggers synthetic MouseEvent event.
                    var target = evt.target;
                    if (target && target.tagName === 'A' && isEnter) {
                        return;
                    }
                    this.preventDefaultEvent_(evt);
                    if (this.isSelectableList_()) {
                        this.setSelectedIndexOnAction_(currentIndex);
                    }
                    this.adapter_.notifyAction(currentIndex);
                }
            }
            this.focusedItemIndex_ = currentIndex;
            if (nextIndex !== undefined) {
                this.setTabindexAtIndex_(nextIndex);
                this.focusedItemIndex_ = nextIndex;
            }
        };
        /**
         * Click handler for the list.
         */
        MDCListFoundation.prototype.handleClick = function (index, toggleCheckbox) {
            if (index === numbers.UNSET_INDEX) {
                return;
            }
            if (this.isSelectableList_()) {
                this.setSelectedIndexOnAction_(index, toggleCheckbox);
            }
            this.adapter_.notifyAction(index);
            this.setTabindexAtIndex_(index);
            this.focusedItemIndex_ = index;
        };
        /**
         * Focuses the next element on the list.
         */
        MDCListFoundation.prototype.focusNextElement = function (index) {
            var count = this.adapter_.getListItemCount();
            var nextIndex = index + 1;
            if (nextIndex >= count) {
                if (this.wrapFocus_) {
                    nextIndex = 0;
                }
                else {
                    // Return early because last item is already focused.
                    return index;
                }
            }
            this.adapter_.focusItemAtIndex(nextIndex);
            return nextIndex;
        };
        /**
         * Focuses the previous element on the list.
         */
        MDCListFoundation.prototype.focusPrevElement = function (index) {
            var prevIndex = index - 1;
            if (prevIndex < 0) {
                if (this.wrapFocus_) {
                    prevIndex = this.adapter_.getListItemCount() - 1;
                }
                else {
                    // Return early because first item is already focused.
                    return index;
                }
            }
            this.adapter_.focusItemAtIndex(prevIndex);
            return prevIndex;
        };
        MDCListFoundation.prototype.focusFirstElement = function () {
            this.adapter_.focusItemAtIndex(0);
            return 0;
        };
        MDCListFoundation.prototype.focusLastElement = function () {
            var lastIndex = this.adapter_.getListItemCount() - 1;
            this.adapter_.focusItemAtIndex(lastIndex);
            return lastIndex;
        };
        /**
         * Ensures that preventDefault is only called if the containing element doesn't
         * consume the event, and it will cause an unintended scroll.
         */
        MDCListFoundation.prototype.preventDefaultEvent_ = function (evt) {
            var target = evt.target;
            var tagName = ("" + target.tagName).toLowerCase();
            if (ELEMENTS_KEY_ALLOWED_IN.indexOf(tagName) === -1) {
                evt.preventDefault();
            }
        };
        MDCListFoundation.prototype.setSingleSelectionAtIndex_ = function (index) {
            if (this.selectedIndex_ === index) {
                return;
            }
            var selectedClassName = cssClasses.LIST_ITEM_SELECTED_CLASS;
            if (this.useActivatedClass_) {
                selectedClassName = cssClasses.LIST_ITEM_ACTIVATED_CLASS;
            }
            if (this.selectedIndex_ !== numbers.UNSET_INDEX) {
                this.adapter_.removeClassForElementIndex(this.selectedIndex_, selectedClassName);
            }
            this.adapter_.addClassForElementIndex(index, selectedClassName);
            this.setAriaForSingleSelectionAtIndex_(index);
            this.selectedIndex_ = index;
        };
        /**
         * Sets aria attribute for single selection at given index.
         */
        MDCListFoundation.prototype.setAriaForSingleSelectionAtIndex_ = function (index) {
            // Detect the presence of aria-current and get the value only during list initialization when it is in unset state.
            if (this.selectedIndex_ === numbers.UNSET_INDEX) {
                this.ariaCurrentAttrValue_ =
                    this.adapter_.getAttributeForElementIndex(index, strings.ARIA_CURRENT);
            }
            var isAriaCurrent = this.ariaCurrentAttrValue_ !== null;
            var ariaAttribute = isAriaCurrent ? strings.ARIA_CURRENT : strings.ARIA_SELECTED;
            if (this.selectedIndex_ !== numbers.UNSET_INDEX) {
                this.adapter_.setAttributeForElementIndex(this.selectedIndex_, ariaAttribute, 'false');
            }
            var ariaAttributeValue = isAriaCurrent ? this.ariaCurrentAttrValue_ : 'true';
            this.adapter_.setAttributeForElementIndex(index, ariaAttribute, ariaAttributeValue);
        };
        /**
         * Toggles radio at give index. Radio doesn't change the checked state if it is already checked.
         */
        MDCListFoundation.prototype.setRadioAtIndex_ = function (index) {
            this.adapter_.setCheckedCheckboxOrRadioAtIndex(index, true);
            if (this.selectedIndex_ !== numbers.UNSET_INDEX) {
                this.adapter_.setAttributeForElementIndex(this.selectedIndex_, strings.ARIA_CHECKED, 'false');
            }
            this.adapter_.setAttributeForElementIndex(index, strings.ARIA_CHECKED, 'true');
            this.selectedIndex_ = index;
        };
        MDCListFoundation.prototype.setCheckboxAtIndex_ = function (index) {
            for (var i = 0; i < this.adapter_.getListItemCount(); i++) {
                var isChecked = false;
                if (index.indexOf(i) >= 0) {
                    isChecked = true;
                }
                this.adapter_.setCheckedCheckboxOrRadioAtIndex(i, isChecked);
                this.adapter_.setAttributeForElementIndex(i, strings.ARIA_CHECKED, isChecked ? 'true' : 'false');
            }
            this.selectedIndex_ = index;
        };
        MDCListFoundation.prototype.setTabindexAtIndex_ = function (index) {
            if (this.focusedItemIndex_ === numbers.UNSET_INDEX && index !== 0) {
                // If no list item was selected set first list item's tabindex to -1.
                // Generally, tabindex is set to 0 on first list item of list that has no preselected items.
                this.adapter_.setAttributeForElementIndex(0, 'tabindex', '-1');
            }
            else if (this.focusedItemIndex_ >= 0 && this.focusedItemIndex_ !== index) {
                this.adapter_.setAttributeForElementIndex(this.focusedItemIndex_, 'tabindex', '-1');
            }
            this.adapter_.setAttributeForElementIndex(index, 'tabindex', '0');
        };
        /**
         * @return Return true if it is single selectin list, checkbox list or radio list.
         */
        MDCListFoundation.prototype.isSelectableList_ = function () {
            return this.isSingleSelectionList_ || this.isCheckboxList_ || this.isRadioList_;
        };
        MDCListFoundation.prototype.setTabindexToFirstSelectedItem_ = function () {
            var targetIndex = 0;
            if (this.isSelectableList_()) {
                if (typeof this.selectedIndex_ === 'number' && this.selectedIndex_ !== numbers.UNSET_INDEX) {
                    targetIndex = this.selectedIndex_;
                }
                else if (isNumberArray(this.selectedIndex_) && this.selectedIndex_.length > 0) {
                    targetIndex = this.selectedIndex_.reduce(function (currentIndex, minIndex) { return Math.min(currentIndex, minIndex); });
                }
            }
            this.setTabindexAtIndex_(targetIndex);
        };
        MDCListFoundation.prototype.isIndexValid_ = function (index) {
            var _this = this;
            if (index instanceof Array) {
                if (!this.isCheckboxList_) {
                    throw new Error('MDCListFoundation: Array of index is only supported for checkbox based list');
                }
                if (index.length === 0) {
                    return true;
                }
                else {
                    return index.some(function (i) { return _this.isIndexInRange_(i); });
                }
            }
            else if (typeof index === 'number') {
                if (this.isCheckboxList_) {
                    throw new Error('MDCListFoundation: Expected array of index for checkbox based list but got number: ' + index);
                }
                return this.isIndexInRange_(index);
            }
            else {
                return false;
            }
        };
        MDCListFoundation.prototype.isIndexInRange_ = function (index) {
            var listSize = this.adapter_.getListItemCount();
            return index >= 0 && index < listSize;
        };
        MDCListFoundation.prototype.setSelectedIndexOnAction_ = function (index, toggleCheckbox) {
            if (toggleCheckbox === void 0) { toggleCheckbox = true; }
            if (this.isCheckboxList_) {
                this.toggleCheckboxAtIndex_(index, toggleCheckbox);
            }
            else {
                this.setSelectedIndex(index);
            }
        };
        MDCListFoundation.prototype.toggleCheckboxAtIndex_ = function (index, toggleCheckbox) {
            var isChecked = this.adapter_.isCheckboxCheckedAtIndex(index);
            if (toggleCheckbox) {
                isChecked = !isChecked;
                this.adapter_.setCheckedCheckboxOrRadioAtIndex(index, isChecked);
            }
            this.adapter_.setAttributeForElementIndex(index, strings.ARIA_CHECKED, isChecked ? 'true' : 'false');
            // If none of the checkbox items are selected and selectedIndex is not initialized then provide a default value.
            var selectedIndexes = this.selectedIndex_ === numbers.UNSET_INDEX ? [] : this.selectedIndex_.slice();
            if (isChecked) {
                selectedIndexes.push(index);
            }
            else {
                selectedIndexes = selectedIndexes.filter(function (i) { return i !== index; });
            }
            this.selectedIndex_ = selectedIndexes;
        };
        return MDCListFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCList = /** @class */ (function (_super) {
        __extends(MDCList, _super);
        function MDCList() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Object.defineProperty(MDCList.prototype, "vertical", {
            set: function (value) {
                this.foundation_.setVerticalOrientation(value);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCList.prototype, "listElements", {
            get: function () {
                return [].slice.call(this.root_.querySelectorAll("." + cssClasses.LIST_ITEM_CLASS));
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCList.prototype, "wrapFocus", {
            set: function (value) {
                this.foundation_.setWrapFocus(value);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCList.prototype, "singleSelection", {
            set: function (isSingleSelectionList) {
                this.foundation_.setSingleSelection(isSingleSelectionList);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCList.prototype, "selectedIndex", {
            get: function () {
                return this.foundation_.getSelectedIndex();
            },
            set: function (index) {
                this.foundation_.setSelectedIndex(index);
            },
            enumerable: true,
            configurable: true
        });
        MDCList.attachTo = function (root) {
            return new MDCList(root);
        };
        MDCList.prototype.initialSyncWithDOM = function () {
            this.handleClick_ = this.handleClickEvent_.bind(this);
            this.handleKeydown_ = this.handleKeydownEvent_.bind(this);
            this.focusInEventListener_ = this.handleFocusInEvent_.bind(this);
            this.focusOutEventListener_ = this.handleFocusOutEvent_.bind(this);
            this.listen('keydown', this.handleKeydown_);
            this.listen('click', this.handleClick_);
            this.listen('focusin', this.focusInEventListener_);
            this.listen('focusout', this.focusOutEventListener_);
            this.layout();
            this.initializeListType();
        };
        MDCList.prototype.destroy = function () {
            this.unlisten('keydown', this.handleKeydown_);
            this.unlisten('click', this.handleClick_);
            this.unlisten('focusin', this.focusInEventListener_);
            this.unlisten('focusout', this.focusOutEventListener_);
        };
        MDCList.prototype.layout = function () {
            var direction = this.root_.getAttribute(strings.ARIA_ORIENTATION);
            this.vertical = direction !== strings.ARIA_ORIENTATION_HORIZONTAL;
            // List items need to have at least tabindex=-1 to be focusable.
            [].slice.call(this.root_.querySelectorAll('.mdc-list-item:not([tabindex])'))
                .forEach(function (el) {
                el.setAttribute('tabindex', '-1');
            });
            // Child button/a elements are not tabbable until the list item is focused.
            [].slice.call(this.root_.querySelectorAll(strings.FOCUSABLE_CHILD_ELEMENTS))
                .forEach(function (el) { return el.setAttribute('tabindex', '-1'); });
            this.foundation_.layout();
        };
        /**
         * Initialize selectedIndex value based on pre-selected checkbox list items, single selection or radio.
         */
        MDCList.prototype.initializeListType = function () {
            var _this = this;
            var checkboxListItems = this.root_.querySelectorAll(strings.ARIA_ROLE_CHECKBOX_SELECTOR);
            var singleSelectedListItem = this.root_.querySelector("\n      ." + cssClasses.LIST_ITEM_ACTIVATED_CLASS + ",\n      ." + cssClasses.LIST_ITEM_SELECTED_CLASS + "\n    ");
            var radioSelectedListItem = this.root_.querySelector(strings.ARIA_CHECKED_RADIO_SELECTOR);
            if (checkboxListItems.length) {
                var preselectedItems = this.root_.querySelectorAll(strings.ARIA_CHECKED_CHECKBOX_SELECTOR);
                this.selectedIndex =
                    [].map.call(preselectedItems, function (listItem) { return _this.listElements.indexOf(listItem); });
            }
            else if (singleSelectedListItem) {
                if (singleSelectedListItem.classList.contains(cssClasses.LIST_ITEM_ACTIVATED_CLASS)) {
                    this.foundation_.setUseActivatedClass(true);
                }
                this.singleSelection = true;
                this.selectedIndex = this.listElements.indexOf(singleSelectedListItem);
            }
            else if (radioSelectedListItem) {
                this.selectedIndex = this.listElements.indexOf(radioSelectedListItem);
            }
        };
        MDCList.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = {
                addClassForElementIndex: function (index, className) {
                    var element = _this.listElements[index];
                    if (element) {
                        element.classList.add(className);
                    }
                },
                focusItemAtIndex: function (index) {
                    var element = _this.listElements[index];
                    if (element) {
                        element.focus();
                    }
                },
                getAttributeForElementIndex: function (index, attr) { return _this.listElements[index].getAttribute(attr); },
                getFocusedElementIndex: function () { return _this.listElements.indexOf(document.activeElement); },
                getListItemCount: function () { return _this.listElements.length; },
                hasCheckboxAtIndex: function (index) {
                    var listItem = _this.listElements[index];
                    return !!listItem.querySelector(strings.CHECKBOX_SELECTOR);
                },
                hasRadioAtIndex: function (index) {
                    var listItem = _this.listElements[index];
                    return !!listItem.querySelector(strings.RADIO_SELECTOR);
                },
                isCheckboxCheckedAtIndex: function (index) {
                    var listItem = _this.listElements[index];
                    var toggleEl = listItem.querySelector(strings.CHECKBOX_SELECTOR);
                    return toggleEl.checked;
                },
                isFocusInsideList: function () {
                    return _this.root_.contains(document.activeElement);
                },
                isRootFocused: function () { return document.activeElement === _this.root_; },
                notifyAction: function (index) {
                    _this.emit(strings.ACTION_EVENT, { index: index }, /** shouldBubble */ true);
                },
                removeClassForElementIndex: function (index, className) {
                    var element = _this.listElements[index];
                    if (element) {
                        element.classList.remove(className);
                    }
                },
                setAttributeForElementIndex: function (index, attr, value) {
                    var element = _this.listElements[index];
                    if (element) {
                        element.setAttribute(attr, value);
                    }
                },
                setCheckedCheckboxOrRadioAtIndex: function (index, isChecked) {
                    var listItem = _this.listElements[index];
                    var toggleEl = listItem.querySelector(strings.CHECKBOX_RADIO_SELECTOR);
                    toggleEl.checked = isChecked;
                    var event = document.createEvent('Event');
                    event.initEvent('change', true, true);
                    toggleEl.dispatchEvent(event);
                },
                setTabIndexForListItemChildren: function (listItemIndex, tabIndexValue) {
                    var element = _this.listElements[listItemIndex];
                    var listItemChildren = [].slice.call(element.querySelectorAll(strings.CHILD_ELEMENTS_TO_TOGGLE_TABINDEX));
                    listItemChildren.forEach(function (el) { return el.setAttribute('tabindex', tabIndexValue); });
                },
            };
            return new MDCListFoundation(adapter);
        };
        /**
         * Used to figure out which list item this event is targetting. Or returns -1 if
         * there is no list item
         */
        MDCList.prototype.getListItemIndex_ = function (evt) {
            var eventTarget = evt.target;
            var nearestParent = closest(eventTarget, "." + cssClasses.LIST_ITEM_CLASS + ", ." + cssClasses.ROOT);
            // Get the index of the element if it is a list item.
            if (nearestParent && matches$1(nearestParent, "." + cssClasses.LIST_ITEM_CLASS)) {
                return this.listElements.indexOf(nearestParent);
            }
            return -1;
        };
        /**
         * Used to figure out which element was clicked before sending the event to the foundation.
         */
        MDCList.prototype.handleFocusInEvent_ = function (evt) {
            var index = this.getListItemIndex_(evt);
            this.foundation_.handleFocusIn(evt, index);
        };
        /**
         * Used to figure out which element was clicked before sending the event to the foundation.
         */
        MDCList.prototype.handleFocusOutEvent_ = function (evt) {
            var index = this.getListItemIndex_(evt);
            this.foundation_.handleFocusOut(evt, index);
        };
        /**
         * Used to figure out which element was focused when keydown event occurred before sending the event to the
         * foundation.
         */
        MDCList.prototype.handleKeydownEvent_ = function (evt) {
            var index = this.getListItemIndex_(evt);
            var target = evt.target;
            this.foundation_.handleKeydown(evt, target.classList.contains(cssClasses.LIST_ITEM_CLASS), index);
        };
        /**
         * Used to figure out which element was clicked before sending the event to the foundation.
         */
        MDCList.prototype.handleClickEvent_ = function (evt) {
            var index = this.getListItemIndex_(evt);
            var target = evt.target;
            // Toggle the checkbox only if it's not the target of the event, or the checkbox will have 2 change events.
            var toggleCheckbox = !matches$1(target, strings.CHECKBOX_RADIO_SELECTOR);
            this.foundation_.handleClick(index, toggleCheckbox);
        };
        return MDCList;
    }(MDCComponent));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$1 = {
        ANIMATE: 'mdc-drawer--animate',
        CLOSING: 'mdc-drawer--closing',
        DISMISSIBLE: 'mdc-drawer--dismissible',
        MODAL: 'mdc-drawer--modal',
        OPEN: 'mdc-drawer--open',
        OPENING: 'mdc-drawer--opening',
        ROOT: 'mdc-drawer',
    };
    var strings$1 = {
        APP_CONTENT_SELECTOR: '.mdc-drawer-app-content',
        CLOSE_EVENT: 'MDCDrawer:closed',
        OPEN_EVENT: 'MDCDrawer:opened',
        SCRIM_SELECTOR: '.mdc-drawer-scrim',
    };

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCDismissibleDrawerFoundation = /** @class */ (function (_super) {
        __extends(MDCDismissibleDrawerFoundation, _super);
        function MDCDismissibleDrawerFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCDismissibleDrawerFoundation.defaultAdapter, adapter)) || this;
            _this.animationFrame_ = 0;
            _this.animationTimer_ = 0;
            return _this;
        }
        Object.defineProperty(MDCDismissibleDrawerFoundation, "strings", {
            get: function () {
                return strings$1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCDismissibleDrawerFoundation, "cssClasses", {
            get: function () {
                return cssClasses$1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCDismissibleDrawerFoundation, "defaultAdapter", {
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    hasClass: function () { return false; },
                    elementHasClass: function () { return false; },
                    notifyClose: function () { return undefined; },
                    notifyOpen: function () { return undefined; },
                    saveFocus: function () { return undefined; },
                    restoreFocus: function () { return undefined; },
                    focusActiveNavigationItem: function () { return undefined; },
                    trapFocus: function () { return undefined; },
                    releaseFocus: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCDismissibleDrawerFoundation.prototype.destroy = function () {
            if (this.animationFrame_) {
                cancelAnimationFrame(this.animationFrame_);
            }
            if (this.animationTimer_) {
                clearTimeout(this.animationTimer_);
            }
        };
        MDCDismissibleDrawerFoundation.prototype.open = function () {
            var _this = this;
            if (this.isOpen() || this.isOpening() || this.isClosing()) {
                return;
            }
            this.adapter_.addClass(cssClasses$1.OPEN);
            this.adapter_.addClass(cssClasses$1.ANIMATE);
            // Wait a frame once display is no longer "none", to establish basis for animation
            this.runNextAnimationFrame_(function () {
                _this.adapter_.addClass(cssClasses$1.OPENING);
            });
            this.adapter_.saveFocus();
        };
        MDCDismissibleDrawerFoundation.prototype.close = function () {
            if (!this.isOpen() || this.isOpening() || this.isClosing()) {
                return;
            }
            this.adapter_.addClass(cssClasses$1.CLOSING);
        };
        /**
         * @return true if drawer is in open state.
         */
        MDCDismissibleDrawerFoundation.prototype.isOpen = function () {
            return this.adapter_.hasClass(cssClasses$1.OPEN);
        };
        /**
         * @return true if drawer is animating open.
         */
        MDCDismissibleDrawerFoundation.prototype.isOpening = function () {
            return this.adapter_.hasClass(cssClasses$1.OPENING) || this.adapter_.hasClass(cssClasses$1.ANIMATE);
        };
        /**
         * @return true if drawer is animating closed.
         */
        MDCDismissibleDrawerFoundation.prototype.isClosing = function () {
            return this.adapter_.hasClass(cssClasses$1.CLOSING);
        };
        /**
         * Keydown handler to close drawer when key is escape.
         */
        MDCDismissibleDrawerFoundation.prototype.handleKeydown = function (evt) {
            var keyCode = evt.keyCode, key = evt.key;
            var isEscape = key === 'Escape' || keyCode === 27;
            if (isEscape) {
                this.close();
            }
        };
        /**
         * Handles a transition end event on the root element.
         */
        MDCDismissibleDrawerFoundation.prototype.handleTransitionEnd = function (evt) {
            var OPENING = cssClasses$1.OPENING, CLOSING = cssClasses$1.CLOSING, OPEN = cssClasses$1.OPEN, ANIMATE = cssClasses$1.ANIMATE, ROOT = cssClasses$1.ROOT;
            // In Edge, transitionend on ripple pseudo-elements yields a target without classList, so check for Element first.
            var isRootElement = this.isElement_(evt.target) && this.adapter_.elementHasClass(evt.target, ROOT);
            if (!isRootElement) {
                return;
            }
            if (this.isClosing()) {
                this.adapter_.removeClass(OPEN);
                this.closed_();
                this.adapter_.restoreFocus();
                this.adapter_.notifyClose();
            }
            else {
                this.adapter_.focusActiveNavigationItem();
                this.opened_();
                this.adapter_.notifyOpen();
            }
            this.adapter_.removeClass(ANIMATE);
            this.adapter_.removeClass(OPENING);
            this.adapter_.removeClass(CLOSING);
        };
        /**
         * Extension point for when drawer finishes open animation.
         */
        MDCDismissibleDrawerFoundation.prototype.opened_ = function () { }; // tslint:disable-line:no-empty
        /**
         * Extension point for when drawer finishes close animation.
         */
        MDCDismissibleDrawerFoundation.prototype.closed_ = function () { }; // tslint:disable-line:no-empty
        /**
         * Runs the given logic on the next animation frame, using setTimeout to factor in Firefox reflow behavior.
         */
        MDCDismissibleDrawerFoundation.prototype.runNextAnimationFrame_ = function (callback) {
            var _this = this;
            cancelAnimationFrame(this.animationFrame_);
            this.animationFrame_ = requestAnimationFrame(function () {
                _this.animationFrame_ = 0;
                clearTimeout(_this.animationTimer_);
                _this.animationTimer_ = setTimeout(callback, 0);
            });
        };
        MDCDismissibleDrawerFoundation.prototype.isElement_ = function (element) {
            // In Edge, transitionend on ripple pseudo-elements yields a target without classList.
            return Boolean(element.classList);
        };
        return MDCDismissibleDrawerFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    /* istanbul ignore next: subclass is not a branch statement */
    var MDCModalDrawerFoundation = /** @class */ (function (_super) {
        __extends(MDCModalDrawerFoundation, _super);
        function MDCModalDrawerFoundation() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        /**
         * Handles click event on scrim.
         */
        MDCModalDrawerFoundation.prototype.handleScrimClick = function () {
            this.close();
        };
        /**
         * Called when drawer finishes open animation.
         */
        MDCModalDrawerFoundation.prototype.opened_ = function () {
            this.adapter_.trapFocus();
        };
        /**
         * Called when drawer finishes close animation.
         */
        MDCModalDrawerFoundation.prototype.closed_ = function () {
            this.adapter_.releaseFocus();
        };
        return MDCModalDrawerFoundation;
    }(MDCDismissibleDrawerFoundation));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$2 = MDCDismissibleDrawerFoundation.cssClasses, strings$2 = MDCDismissibleDrawerFoundation.strings;
    var MDCDrawer = /** @class */ (function (_super) {
        __extends(MDCDrawer, _super);
        function MDCDrawer() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCDrawer.attachTo = function (root) {
            return new MDCDrawer(root);
        };
        Object.defineProperty(MDCDrawer.prototype, "open", {
            /**
             * Returns true if drawer is in the open position.
             */
            get: function () {
                return this.foundation_.isOpen();
            },
            /**
             * Toggles the drawer open and closed.
             */
            set: function (isOpen) {
                if (isOpen) {
                    this.foundation_.open();
                }
                else {
                    this.foundation_.close();
                }
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCDrawer.prototype, "list", {
            get: function () {
                return this.list_;
            },
            enumerable: true,
            configurable: true
        });
        MDCDrawer.prototype.initialize = function (focusTrapFactory, listFactory) {
            if (focusTrapFactory === void 0) { focusTrapFactory = focusTrap_1; }
            if (listFactory === void 0) { listFactory = function (el) { return new MDCList(el); }; }
            var listEl = this.root_.querySelector("." + MDCListFoundation.cssClasses.ROOT);
            if (listEl) {
                this.list_ = listFactory(listEl);
                this.list_.wrapFocus = true;
            }
            this.focusTrapFactory_ = focusTrapFactory;
        };
        MDCDrawer.prototype.initialSyncWithDOM = function () {
            var _this = this;
            var MODAL = cssClasses$2.MODAL;
            var SCRIM_SELECTOR = strings$2.SCRIM_SELECTOR;
            this.scrim_ = this.root_.parentNode.querySelector(SCRIM_SELECTOR);
            if (this.scrim_ && this.root_.classList.contains(MODAL)) {
                this.handleScrimClick_ = function () { return _this.foundation_.handleScrimClick(); };
                this.scrim_.addEventListener('click', this.handleScrimClick_);
                this.focusTrap_ = createFocusTrapInstance(this.root_, this.focusTrapFactory_);
            }
            this.handleKeydown_ = function (evt) { return _this.foundation_.handleKeydown(evt); };
            this.handleTransitionEnd_ = function (evt) { return _this.foundation_.handleTransitionEnd(evt); };
            this.listen('keydown', this.handleKeydown_);
            this.listen('transitionend', this.handleTransitionEnd_);
        };
        MDCDrawer.prototype.destroy = function () {
            this.unlisten('keydown', this.handleKeydown_);
            this.unlisten('transitionend', this.handleTransitionEnd_);
            if (this.list_) {
                this.list_.destroy();
            }
            var MODAL = cssClasses$2.MODAL;
            if (this.scrim_ && this.handleScrimClick_ && this.root_.classList.contains(MODAL)) {
                this.scrim_.removeEventListener('click', this.handleScrimClick_);
                // Ensure drawer is closed to hide scrim and release focus
                this.open = false;
            }
        };
        MDCDrawer.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                elementHasClass: function (element, className) { return element.classList.contains(className); },
                saveFocus: function () { return _this.previousFocus_ = document.activeElement; },
                restoreFocus: function () {
                    var previousFocus = _this.previousFocus_;
                    if (previousFocus && previousFocus.focus && _this.root_.contains(document.activeElement)) {
                        previousFocus.focus();
                    }
                },
                focusActiveNavigationItem: function () {
                    var activeNavItemEl = _this.root_.querySelector("." + MDCListFoundation.cssClasses.LIST_ITEM_ACTIVATED_CLASS);
                    if (activeNavItemEl) {
                        activeNavItemEl.focus();
                    }
                },
                notifyClose: function () { return _this.emit(strings$2.CLOSE_EVENT, {}, true /* shouldBubble */); },
                notifyOpen: function () { return _this.emit(strings$2.OPEN_EVENT, {}, true /* shouldBubble */); },
                trapFocus: function () { return _this.focusTrap_.activate(); },
                releaseFocus: function () { return _this.focusTrap_.deactivate(); },
            };
            // tslint:enable:object-literal-sort-keys
            var DISMISSIBLE = cssClasses$2.DISMISSIBLE, MODAL = cssClasses$2.MODAL;
            if (this.root_.classList.contains(DISMISSIBLE)) {
                return new MDCDismissibleDrawerFoundation(adapter);
            }
            else if (this.root_.classList.contains(MODAL)) {
                return new MDCModalDrawerFoundation(adapter);
            }
            else {
                throw new Error("MDCDrawer: Failed to instantiate component. Supported variants are " + DISMISSIBLE + " and " + MODAL + ".");
            }
        };
        return MDCDrawer;
    }(MDCComponent));

    const regex = /%s/gi;
    function addClassToSlot(owner, name, className) {
        const el = owner.querySelector(`[slot="${name}"]`);
        el && el.classList.add(className);
    }
    function addClassToSlotNodes(owner, name, className) {
        const el = owner.querySelector(`[slot="${name}"]`);
        if (el && el.childNodes) {
            el.childNodes.forEach((x) => {
                x.classList.add(className);
            });
        }
    }
    function buildClasses(classes, classList) {
        classList = classList || [];
        Object.keys(classes).forEach(x => {
            classes[x] && classList.push(x);
        });
        return classList.join(' ');
    }
    function processClasses(classes, userClasses) {
        if (!userClasses) {
            return classes.join(" ");
        }
        if (Array.isArray(userClasses)) {
            userClasses = userClasses.join(" ");
        }
        if (!regex.test(userClasses)) {
            return userClasses + " " + classes.join(" ");
        }
        return userClasses.replace(regex, classes.join(" "));
    }

    /* src\components\Drawer\Drawer.svelte generated by Svelte v3.6.1 */

    const get_header_slot_changes = ({}) => ({});
    const get_header_slot_context = ({}) => ({});

    // (72:0) {#if modal}
    function create_if_block(ctx) {
    	var div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "mdc-drawer-scrim");
    		},

    		m(target, anchor) {
    			insert(target, div, anchor);
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(div);
    			}
    		}
    	};
    }

    function create_fragment(ctx) {
    	var aside, t0, aside_class_value, t1, if_block_anchor, current;

    	const header_slot_1 = ctx.$$slots.header;
    	const header_slot = create_slot(header_slot_1, ctx, get_header_slot_context);

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	var if_block = (ctx.modal) && create_if_block();

    	return {
    		c() {
    			aside = element("aside");

    			if (header_slot) header_slot.c();
    			t0 = space();

    			if (default_slot) default_slot.c();
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();

    			attr(aside, "class", aside_class_value = "mdc-drawer " + (ctx.dismissible ? 'mdc-drawer--dismissible' : '') + (ctx.modal ? 'mdc-drawer--modal' : ''));
    		},

    		l(nodes) {
    			if (header_slot) header_slot.l(aside_nodes);

    			if (default_slot) default_slot.l(aside_nodes);
    		},

    		m(target, anchor) {
    			insert(target, aside, anchor);

    			if (header_slot) {
    				header_slot.m(aside, null);
    			}

    			append(aside, t0);

    			if (default_slot) {
    				default_slot.m(aside, null);
    			}

    			add_binding_callback(() => ctx.aside_binding(aside, null));
    			insert(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},

    		p(changed, ctx) {
    			if (header_slot && header_slot.p && changed.$$scope) {
    				header_slot.p(get_slot_changes(header_slot_1, ctx, changed, get_header_slot_changes), get_slot_context(header_slot_1, ctx, get_header_slot_context));
    			}

    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (changed.items) {
    				ctx.aside_binding(null, aside);
    				ctx.aside_binding(aside, null);
    			}

    			if ((!current || changed.dismissible || changed.modal) && aside_class_value !== (aside_class_value = "mdc-drawer " + (ctx.dismissible ? 'mdc-drawer--dismissible' : '') + (ctx.modal ? 'mdc-drawer--modal' : ''))) {
    				attr(aside, "class", aside_class_value);
    			}

    			if (ctx.modal) {
    				if (!if_block) {
    					if_block = create_if_block();
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(header_slot, local);
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(header_slot, local);
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(aside);
    			}

    			if (header_slot) header_slot.d(detaching);

    			if (default_slot) default_slot.d(detaching);
    			ctx.aside_binding(null, aside);

    			if (detaching) {
    				detach(t1);
    			}

    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	

      let { mdc = 'mdc-drawer', self = null, primaryToolbarSpacer = false, primaryContent = '', slots = $$props.$$slots || {}, dismissible = false, modal = false, open = false } = $$props;

      let mdcComponent;
      const dispatch = createEventDispatcher();

      let { spacerClasses } = $$props;

      let { contentClasses } = $$props;

      onMount(() => {
        addClassToSlot(self, 'header', 'mdc-drawer__header');
        addClassToSlot(self, 'default', 'mdc-drawer__content');

        if (!mdcComponent && (dismissible || modal)) { 
          mdcComponent = new MDCDrawer(self);
        }
        if (mdcComponent) {
          mdcComponent.listen("MDCDrawer:opened", () => {
            dispatch("opened");
          });
          mdcComponent.listen("MDCDrawer:closed", (e) => {
            $$invalidate('open', open = false);
            dispatch("closed", e);
            console.log("closed", e);
          });
        }    
      });

      afterUpdate(() => {
        if (mdcComponent && open !== mdcComponent.open) {
          mdcComponent.open = open;    }
      });

      onDestroy(() => {
        if (mdcComponent) mdcComponent.destroy();
      });

      function toggle(isOpen) {
        $$invalidate('open', open = isOpen === undefined ? !open : isOpen);
      }

    	let { $$slots = {}, $$scope } = $$props;

    	function aside_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate('$$props', $$props = assign(assign({}, $$props), $$new_props));
    		if ('mdc' in $$new_props) $$invalidate('mdc', mdc = $$new_props.mdc);
    		if ('self' in $$new_props) $$invalidate('self', self = $$new_props.self);
    		if ('primaryToolbarSpacer' in $$new_props) $$invalidate('primaryToolbarSpacer', primaryToolbarSpacer = $$new_props.primaryToolbarSpacer);
    		if ('primaryContent' in $$new_props) $$invalidate('primaryContent', primaryContent = $$new_props.primaryContent);
    		if ('slots' in $$new_props) $$invalidate('slots', slots = $$new_props.slots);
    		if ('dismissible' in $$new_props) $$invalidate('dismissible', dismissible = $$new_props.dismissible);
    		if ('modal' in $$new_props) $$invalidate('modal', modal = $$new_props.modal);
    		if ('open' in $$new_props) $$invalidate('open', open = $$new_props.open);
    		if ('spacerClasses' in $$new_props) $$invalidate('spacerClasses', spacerClasses = $$new_props.spacerClasses);
    		if ('contentClasses' in $$new_props) $$invalidate('contentClasses', contentClasses = $$new_props.contentClasses);
    		if ('$$scope' in $$new_props) $$invalidate('$$scope', $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { primaryToolbarSpacer: 1, primaryContent: 1 }) => {
    		if ($$dirty.primaryToolbarSpacer) { {
            $$invalidate('spacerClasses', spacerClasses = primaryToolbarSpacer && 'mdc-theme--primary-bg mdc-theme--text-primary-on-primary');
          } }
    		if ($$dirty.primaryContent) { {
            $$invalidate('contentClasses', contentClasses = primaryContent && 'mdc-theme--primary-bg mdc-theme--text-primary-on-primary');
          } }
    	};

    	return {
    		mdc,
    		self,
    		primaryToolbarSpacer,
    		primaryContent,
    		slots,
    		dismissible,
    		modal,
    		open,
    		spacerClasses,
    		contentClasses,
    		toggle,
    		aside_binding,
    		$$props: $$props = exclude_internal_props($$props),
    		$$slots,
    		$$scope
    	};
    }

    class Drawer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, ["mdc", "self", "primaryToolbarSpacer", "primaryContent", "slots", "dismissible", "modal", "open", "spacerClasses", "contentClasses", "toggle"]);
    	}

    	get toggle() {
    		return this.$$.ctx.toggle;
    	}
    }

    /* src\components\Drawer\DrawerHeader.svelte generated by Svelte v3.6.1 */

    // (7:2) {#if title}
    function create_if_block_1(ctx) {
    	var h3, t;

    	return {
    		c() {
    			h3 = element("h3");
    			t = text(ctx.title);
    			attr(h3, "class", "mdc-drawer__title");
    		},

    		m(target, anchor) {
    			insert(target, h3, anchor);
    			append(h3, t);
    		},

    		p(changed, ctx) {
    			if (changed.title) {
    				set_data(t, ctx.title);
    			}
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(h3);
    			}
    		}
    	};
    }

    // (10:2) {#if subtitle}
    function create_if_block$1(ctx) {
    	var h6, t;

    	return {
    		c() {
    			h6 = element("h6");
    			t = text(ctx.subtitle);
    			attr(h6, "class", "mdc-drawer__subtitle");
    		},

    		m(target, anchor) {
    			insert(target, h6, anchor);
    			append(h6, t);
    		},

    		p(changed, ctx) {
    			if (changed.subtitle) {
    				set_data(t, ctx.subtitle);
    			}
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(h6);
    			}
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	var div, t0, t1, current;

    	var if_block0 = (ctx.title) && create_if_block_1(ctx);

    	var if_block1 = (ctx.subtitle) && create_if_block$1(ctx);

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();

    			if (default_slot) default_slot.c();

    			attr(div, "class", "mdc-drawer__header");
    		},

    		l(nodes) {
    			if (default_slot) default_slot.l(div_nodes);
    		},

    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t1);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},

    		p(changed, ctx) {
    			if (ctx.title) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    				} else {
    					if_block0 = create_if_block_1(ctx);
    					if_block0.c();
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (ctx.subtitle) {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					if_block1.m(div, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { title = '', subtitle = '' } = $$props;

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('title' in $$props) $$invalidate('title', title = $$props.title);
    		if ('subtitle' in $$props) $$invalidate('subtitle', subtitle = $$props.subtitle);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	return { title, subtitle, $$slots, $$scope };
    }

    class DrawerHeader extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["title", "subtitle"]);
    	}
    }

    /* src\components\Drawer\DrawerContent.svelte generated by Svelte v3.6.1 */

    function create_fragment$2(ctx) {
    	var div, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c() {
    			div = element("div");

    			if (default_slot) default_slot.c();

    			attr(div, "class", "mdc-drawer__content");
    		},

    		l(nodes) {
    			if (default_slot) default_slot.l(div_nodes);
    		},

    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},

    		p(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	return { $$slots, $$scope };
    }

    class DrawerContent extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, []);
    	}
    }

    /* src\components\Drawer\DrawerAppContent.svelte generated by Svelte v3.6.1 */

    function create_fragment$3(ctx) {
    	var div, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c() {
    			div = element("div");

    			if (default_slot) default_slot.c();

    			attr(div, "class", "mdc-drawer-app-content");
    		},

    		l(nodes) {
    			if (default_slot) default_slot.l(div_nodes);
    		},

    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},

    		p(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	return { $$slots, $$scope };
    }

    class DrawerAppContent extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, []);
    	}
    }

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$3 = {
        // Ripple is a special case where the "root" component is really a "mixin" of sorts,
        // given that it's an 'upgrade' to an existing component. That being said it is the root
        // CSS class that all other CSS classes derive from.
        BG_FOCUSED: 'mdc-ripple-upgraded--background-focused',
        FG_ACTIVATION: 'mdc-ripple-upgraded--foreground-activation',
        FG_DEACTIVATION: 'mdc-ripple-upgraded--foreground-deactivation',
        ROOT: 'mdc-ripple-upgraded',
        UNBOUNDED: 'mdc-ripple-upgraded--unbounded',
    };
    var strings$3 = {
        VAR_FG_SCALE: '--mdc-ripple-fg-scale',
        VAR_FG_SIZE: '--mdc-ripple-fg-size',
        VAR_FG_TRANSLATE_END: '--mdc-ripple-fg-translate-end',
        VAR_FG_TRANSLATE_START: '--mdc-ripple-fg-translate-start',
        VAR_LEFT: '--mdc-ripple-left',
        VAR_TOP: '--mdc-ripple-top',
    };
    var numbers$1 = {
        DEACTIVATION_TIMEOUT_MS: 225,
        FG_DEACTIVATION_MS: 150,
        INITIAL_ORIGIN_SCALE: 0.6,
        PADDING: 10,
        TAP_DELAY_MS: 300,
    };

    /**
     * Stores result from supportsCssVariables to avoid redundant processing to
     * detect CSS custom variable support.
     */
    var supportsCssVariables_;
    /**
     * Stores result from applyPassive to avoid redundant processing to detect
     * passive event listener support.
     */
    var supportsPassive_;
    function detectEdgePseudoVarBug(windowObj) {
        // Detect versions of Edge with buggy var() support
        // See: https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/11495448/
        var document = windowObj.document;
        var node = document.createElement('div');
        node.className = 'mdc-ripple-surface--test-edge-var-bug';
        document.body.appendChild(node);
        // The bug exists if ::before style ends up propagating to the parent element.
        // Additionally, getComputedStyle returns null in iframes with display: "none" in Firefox,
        // but Firefox is known to support CSS custom properties correctly.
        // See: https://bugzilla.mozilla.org/show_bug.cgi?id=548397
        var computedStyle = windowObj.getComputedStyle(node);
        var hasPseudoVarBug = computedStyle !== null && computedStyle.borderTopStyle === 'solid';
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
        return hasPseudoVarBug;
    }
    function supportsCssVariables(windowObj, forceRefresh) {
        if (forceRefresh === void 0) { forceRefresh = false; }
        var CSS = windowObj.CSS;
        var supportsCssVars = supportsCssVariables_;
        if (typeof supportsCssVariables_ === 'boolean' && !forceRefresh) {
            return supportsCssVariables_;
        }
        var supportsFunctionPresent = CSS && typeof CSS.supports === 'function';
        if (!supportsFunctionPresent) {
            return false;
        }
        var explicitlySupportsCssVars = CSS.supports('--css-vars', 'yes');
        // See: https://bugs.webkit.org/show_bug.cgi?id=154669
        // See: README section on Safari
        var weAreFeatureDetectingSafari10plus = (CSS.supports('(--css-vars: yes)') &&
            CSS.supports('color', '#00000000'));
        if (explicitlySupportsCssVars || weAreFeatureDetectingSafari10plus) {
            supportsCssVars = !detectEdgePseudoVarBug(windowObj);
        }
        else {
            supportsCssVars = false;
        }
        if (!forceRefresh) {
            supportsCssVariables_ = supportsCssVars;
        }
        return supportsCssVars;
    }
    /**
     * Determine whether the current browser supports passive event listeners, and
     * if so, use them.
     */
    function applyPassive(globalObj, forceRefresh) {
        if (globalObj === void 0) { globalObj = window; }
        if (forceRefresh === void 0) { forceRefresh = false; }
        if (supportsPassive_ === undefined || forceRefresh) {
            var isSupported_1 = false;
            try {
                globalObj.document.addEventListener('test', function () { return undefined; }, {
                    get passive() {
                        isSupported_1 = true;
                        return isSupported_1;
                    },
                });
            }
            catch (e) {
            } // tslint:disable-line:no-empty cannot throw error due to tests. tslint also disables console.log.
            supportsPassive_ = isSupported_1;
        }
        return supportsPassive_ ? { passive: true } : false;
    }
    function getNormalizedEventCoords(evt, pageOffset, clientRect) {
        if (!evt) {
            return { x: 0, y: 0 };
        }
        var x = pageOffset.x, y = pageOffset.y;
        var documentX = x + clientRect.left;
        var documentY = y + clientRect.top;
        var normalizedX;
        var normalizedY;
        // Determine touch point relative to the ripple container.
        if (evt.type === 'touchstart') {
            var touchEvent = evt;
            normalizedX = touchEvent.changedTouches[0].pageX - documentX;
            normalizedY = touchEvent.changedTouches[0].pageY - documentY;
        }
        else {
            var mouseEvent = evt;
            normalizedX = mouseEvent.pageX - documentX;
            normalizedY = mouseEvent.pageY - documentY;
        }
        return { x: normalizedX, y: normalizedY };
    }

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    // Activation events registered on the root element of each instance for activation
    var ACTIVATION_EVENT_TYPES = [
        'touchstart', 'pointerdown', 'mousedown', 'keydown',
    ];
    // Deactivation events registered on documentElement when a pointer-related down event occurs
    var POINTER_DEACTIVATION_EVENT_TYPES = [
        'touchend', 'pointerup', 'mouseup', 'contextmenu',
    ];
    // simultaneous nested activations
    var activatedTargets = [];
    var MDCRippleFoundation = /** @class */ (function (_super) {
        __extends(MDCRippleFoundation, _super);
        function MDCRippleFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCRippleFoundation.defaultAdapter, adapter)) || this;
            _this.activationAnimationHasEnded_ = false;
            _this.activationTimer_ = 0;
            _this.fgDeactivationRemovalTimer_ = 0;
            _this.fgScale_ = '0';
            _this.frame_ = { width: 0, height: 0 };
            _this.initialSize_ = 0;
            _this.layoutFrame_ = 0;
            _this.maxRadius_ = 0;
            _this.unboundedCoords_ = { left: 0, top: 0 };
            _this.activationState_ = _this.defaultActivationState_();
            _this.activationTimerCallback_ = function () {
                _this.activationAnimationHasEnded_ = true;
                _this.runDeactivationUXLogicIfReady_();
            };
            _this.activateHandler_ = function (e) { return _this.activate_(e); };
            _this.deactivateHandler_ = function () { return _this.deactivate_(); };
            _this.focusHandler_ = function () { return _this.handleFocus(); };
            _this.blurHandler_ = function () { return _this.handleBlur(); };
            _this.resizeHandler_ = function () { return _this.layout(); };
            return _this;
        }
        Object.defineProperty(MDCRippleFoundation, "cssClasses", {
            get: function () {
                return cssClasses$3;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCRippleFoundation, "strings", {
            get: function () {
                return strings$3;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCRippleFoundation, "numbers", {
            get: function () {
                return numbers$1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCRippleFoundation, "defaultAdapter", {
            get: function () {
                return {
                    addClass: function () { return undefined; },
                    browserSupportsCssVars: function () { return true; },
                    computeBoundingRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                    containsEventTarget: function () { return true; },
                    deregisterDocumentInteractionHandler: function () { return undefined; },
                    deregisterInteractionHandler: function () { return undefined; },
                    deregisterResizeHandler: function () { return undefined; },
                    getWindowPageOffset: function () { return ({ x: 0, y: 0 }); },
                    isSurfaceActive: function () { return true; },
                    isSurfaceDisabled: function () { return true; },
                    isUnbounded: function () { return true; },
                    registerDocumentInteractionHandler: function () { return undefined; },
                    registerInteractionHandler: function () { return undefined; },
                    registerResizeHandler: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    updateCssVariable: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCRippleFoundation.prototype.init = function () {
            var _this = this;
            var supportsPressRipple = this.supportsPressRipple_();
            this.registerRootHandlers_(supportsPressRipple);
            if (supportsPressRipple) {
                var _a = MDCRippleFoundation.cssClasses, ROOT_1 = _a.ROOT, UNBOUNDED_1 = _a.UNBOUNDED;
                requestAnimationFrame(function () {
                    _this.adapter_.addClass(ROOT_1);
                    if (_this.adapter_.isUnbounded()) {
                        _this.adapter_.addClass(UNBOUNDED_1);
                        // Unbounded ripples need layout logic applied immediately to set coordinates for both shade and ripple
                        _this.layoutInternal_();
                    }
                });
            }
        };
        MDCRippleFoundation.prototype.destroy = function () {
            var _this = this;
            if (this.supportsPressRipple_()) {
                if (this.activationTimer_) {
                    clearTimeout(this.activationTimer_);
                    this.activationTimer_ = 0;
                    this.adapter_.removeClass(MDCRippleFoundation.cssClasses.FG_ACTIVATION);
                }
                if (this.fgDeactivationRemovalTimer_) {
                    clearTimeout(this.fgDeactivationRemovalTimer_);
                    this.fgDeactivationRemovalTimer_ = 0;
                    this.adapter_.removeClass(MDCRippleFoundation.cssClasses.FG_DEACTIVATION);
                }
                var _a = MDCRippleFoundation.cssClasses, ROOT_2 = _a.ROOT, UNBOUNDED_2 = _a.UNBOUNDED;
                requestAnimationFrame(function () {
                    _this.adapter_.removeClass(ROOT_2);
                    _this.adapter_.removeClass(UNBOUNDED_2);
                    _this.removeCssVars_();
                });
            }
            this.deregisterRootHandlers_();
            this.deregisterDeactivationHandlers_();
        };
        /**
         * @param evt Optional event containing position information.
         */
        MDCRippleFoundation.prototype.activate = function (evt) {
            this.activate_(evt);
        };
        MDCRippleFoundation.prototype.deactivate = function () {
            this.deactivate_();
        };
        MDCRippleFoundation.prototype.layout = function () {
            var _this = this;
            if (this.layoutFrame_) {
                cancelAnimationFrame(this.layoutFrame_);
            }
            this.layoutFrame_ = requestAnimationFrame(function () {
                _this.layoutInternal_();
                _this.layoutFrame_ = 0;
            });
        };
        MDCRippleFoundation.prototype.setUnbounded = function (unbounded) {
            var UNBOUNDED = MDCRippleFoundation.cssClasses.UNBOUNDED;
            if (unbounded) {
                this.adapter_.addClass(UNBOUNDED);
            }
            else {
                this.adapter_.removeClass(UNBOUNDED);
            }
        };
        MDCRippleFoundation.prototype.handleFocus = function () {
            var _this = this;
            requestAnimationFrame(function () {
                return _this.adapter_.addClass(MDCRippleFoundation.cssClasses.BG_FOCUSED);
            });
        };
        MDCRippleFoundation.prototype.handleBlur = function () {
            var _this = this;
            requestAnimationFrame(function () {
                return _this.adapter_.removeClass(MDCRippleFoundation.cssClasses.BG_FOCUSED);
            });
        };
        /**
         * We compute this property so that we are not querying information about the client
         * until the point in time where the foundation requests it. This prevents scenarios where
         * client-side feature-detection may happen too early, such as when components are rendered on the server
         * and then initialized at mount time on the client.
         */
        MDCRippleFoundation.prototype.supportsPressRipple_ = function () {
            return this.adapter_.browserSupportsCssVars();
        };
        MDCRippleFoundation.prototype.defaultActivationState_ = function () {
            return {
                activationEvent: undefined,
                hasDeactivationUXRun: false,
                isActivated: false,
                isProgrammatic: false,
                wasActivatedByPointer: false,
                wasElementMadeActive: false,
            };
        };
        /**
         * supportsPressRipple Passed from init to save a redundant function call
         */
        MDCRippleFoundation.prototype.registerRootHandlers_ = function (supportsPressRipple) {
            var _this = this;
            if (supportsPressRipple) {
                ACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                    _this.adapter_.registerInteractionHandler(evtType, _this.activateHandler_);
                });
                if (this.adapter_.isUnbounded()) {
                    this.adapter_.registerResizeHandler(this.resizeHandler_);
                }
            }
            this.adapter_.registerInteractionHandler('focus', this.focusHandler_);
            this.adapter_.registerInteractionHandler('blur', this.blurHandler_);
        };
        MDCRippleFoundation.prototype.registerDeactivationHandlers_ = function (evt) {
            var _this = this;
            if (evt.type === 'keydown') {
                this.adapter_.registerInteractionHandler('keyup', this.deactivateHandler_);
            }
            else {
                POINTER_DEACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                    _this.adapter_.registerDocumentInteractionHandler(evtType, _this.deactivateHandler_);
                });
            }
        };
        MDCRippleFoundation.prototype.deregisterRootHandlers_ = function () {
            var _this = this;
            ACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                _this.adapter_.deregisterInteractionHandler(evtType, _this.activateHandler_);
            });
            this.adapter_.deregisterInteractionHandler('focus', this.focusHandler_);
            this.adapter_.deregisterInteractionHandler('blur', this.blurHandler_);
            if (this.adapter_.isUnbounded()) {
                this.adapter_.deregisterResizeHandler(this.resizeHandler_);
            }
        };
        MDCRippleFoundation.prototype.deregisterDeactivationHandlers_ = function () {
            var _this = this;
            this.adapter_.deregisterInteractionHandler('keyup', this.deactivateHandler_);
            POINTER_DEACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                _this.adapter_.deregisterDocumentInteractionHandler(evtType, _this.deactivateHandler_);
            });
        };
        MDCRippleFoundation.prototype.removeCssVars_ = function () {
            var _this = this;
            var rippleStrings = MDCRippleFoundation.strings;
            var keys = Object.keys(rippleStrings);
            keys.forEach(function (key) {
                if (key.indexOf('VAR_') === 0) {
                    _this.adapter_.updateCssVariable(rippleStrings[key], null);
                }
            });
        };
        MDCRippleFoundation.prototype.activate_ = function (evt) {
            var _this = this;
            if (this.adapter_.isSurfaceDisabled()) {
                return;
            }
            var activationState = this.activationState_;
            if (activationState.isActivated) {
                return;
            }
            // Avoid reacting to follow-on events fired by touch device after an already-processed user interaction
            var previousActivationEvent = this.previousActivationEvent_;
            var isSameInteraction = previousActivationEvent && evt !== undefined && previousActivationEvent.type !== evt.type;
            if (isSameInteraction) {
                return;
            }
            activationState.isActivated = true;
            activationState.isProgrammatic = evt === undefined;
            activationState.activationEvent = evt;
            activationState.wasActivatedByPointer = activationState.isProgrammatic ? false : evt !== undefined && (evt.type === 'mousedown' || evt.type === 'touchstart' || evt.type === 'pointerdown');
            var hasActivatedChild = evt !== undefined && activatedTargets.length > 0 && activatedTargets.some(function (target) { return _this.adapter_.containsEventTarget(target); });
            if (hasActivatedChild) {
                // Immediately reset activation state, while preserving logic that prevents touch follow-on events
                this.resetActivationState_();
                return;
            }
            if (evt !== undefined) {
                activatedTargets.push(evt.target);
                this.registerDeactivationHandlers_(evt);
            }
            activationState.wasElementMadeActive = this.checkElementMadeActive_(evt);
            if (activationState.wasElementMadeActive) {
                this.animateActivation_();
            }
            requestAnimationFrame(function () {
                // Reset array on next frame after the current event has had a chance to bubble to prevent ancestor ripples
                activatedTargets = [];
                if (!activationState.wasElementMadeActive
                    && evt !== undefined
                    && (evt.key === ' ' || evt.keyCode === 32)) {
                    // If space was pressed, try again within an rAF call to detect :active, because different UAs report
                    // active states inconsistently when they're called within event handling code:
                    // - https://bugs.chromium.org/p/chromium/issues/detail?id=635971
                    // - https://bugzilla.mozilla.org/show_bug.cgi?id=1293741
                    // We try first outside rAF to support Edge, which does not exhibit this problem, but will crash if a CSS
                    // variable is set within a rAF callback for a submit button interaction (#2241).
                    activationState.wasElementMadeActive = _this.checkElementMadeActive_(evt);
                    if (activationState.wasElementMadeActive) {
                        _this.animateActivation_();
                    }
                }
                if (!activationState.wasElementMadeActive) {
                    // Reset activation state immediately if element was not made active.
                    _this.activationState_ = _this.defaultActivationState_();
                }
            });
        };
        MDCRippleFoundation.prototype.checkElementMadeActive_ = function (evt) {
            return (evt !== undefined && evt.type === 'keydown') ? this.adapter_.isSurfaceActive() : true;
        };
        MDCRippleFoundation.prototype.animateActivation_ = function () {
            var _this = this;
            var _a = MDCRippleFoundation.strings, VAR_FG_TRANSLATE_START = _a.VAR_FG_TRANSLATE_START, VAR_FG_TRANSLATE_END = _a.VAR_FG_TRANSLATE_END;
            var _b = MDCRippleFoundation.cssClasses, FG_DEACTIVATION = _b.FG_DEACTIVATION, FG_ACTIVATION = _b.FG_ACTIVATION;
            var DEACTIVATION_TIMEOUT_MS = MDCRippleFoundation.numbers.DEACTIVATION_TIMEOUT_MS;
            this.layoutInternal_();
            var translateStart = '';
            var translateEnd = '';
            if (!this.adapter_.isUnbounded()) {
                var _c = this.getFgTranslationCoordinates_(), startPoint = _c.startPoint, endPoint = _c.endPoint;
                translateStart = startPoint.x + "px, " + startPoint.y + "px";
                translateEnd = endPoint.x + "px, " + endPoint.y + "px";
            }
            this.adapter_.updateCssVariable(VAR_FG_TRANSLATE_START, translateStart);
            this.adapter_.updateCssVariable(VAR_FG_TRANSLATE_END, translateEnd);
            // Cancel any ongoing activation/deactivation animations
            clearTimeout(this.activationTimer_);
            clearTimeout(this.fgDeactivationRemovalTimer_);
            this.rmBoundedActivationClasses_();
            this.adapter_.removeClass(FG_DEACTIVATION);
            // Force layout in order to re-trigger the animation.
            this.adapter_.computeBoundingRect();
            this.adapter_.addClass(FG_ACTIVATION);
            this.activationTimer_ = setTimeout(function () { return _this.activationTimerCallback_(); }, DEACTIVATION_TIMEOUT_MS);
        };
        MDCRippleFoundation.prototype.getFgTranslationCoordinates_ = function () {
            var _a = this.activationState_, activationEvent = _a.activationEvent, wasActivatedByPointer = _a.wasActivatedByPointer;
            var startPoint;
            if (wasActivatedByPointer) {
                startPoint = getNormalizedEventCoords(activationEvent, this.adapter_.getWindowPageOffset(), this.adapter_.computeBoundingRect());
            }
            else {
                startPoint = {
                    x: this.frame_.width / 2,
                    y: this.frame_.height / 2,
                };
            }
            // Center the element around the start point.
            startPoint = {
                x: startPoint.x - (this.initialSize_ / 2),
                y: startPoint.y - (this.initialSize_ / 2),
            };
            var endPoint = {
                x: (this.frame_.width / 2) - (this.initialSize_ / 2),
                y: (this.frame_.height / 2) - (this.initialSize_ / 2),
            };
            return { startPoint: startPoint, endPoint: endPoint };
        };
        MDCRippleFoundation.prototype.runDeactivationUXLogicIfReady_ = function () {
            var _this = this;
            // This method is called both when a pointing device is released, and when the activation animation ends.
            // The deactivation animation should only run after both of those occur.
            var FG_DEACTIVATION = MDCRippleFoundation.cssClasses.FG_DEACTIVATION;
            var _a = this.activationState_, hasDeactivationUXRun = _a.hasDeactivationUXRun, isActivated = _a.isActivated;
            var activationHasEnded = hasDeactivationUXRun || !isActivated;
            if (activationHasEnded && this.activationAnimationHasEnded_) {
                this.rmBoundedActivationClasses_();
                this.adapter_.addClass(FG_DEACTIVATION);
                this.fgDeactivationRemovalTimer_ = setTimeout(function () {
                    _this.adapter_.removeClass(FG_DEACTIVATION);
                }, numbers$1.FG_DEACTIVATION_MS);
            }
        };
        MDCRippleFoundation.prototype.rmBoundedActivationClasses_ = function () {
            var FG_ACTIVATION = MDCRippleFoundation.cssClasses.FG_ACTIVATION;
            this.adapter_.removeClass(FG_ACTIVATION);
            this.activationAnimationHasEnded_ = false;
            this.adapter_.computeBoundingRect();
        };
        MDCRippleFoundation.prototype.resetActivationState_ = function () {
            var _this = this;
            this.previousActivationEvent_ = this.activationState_.activationEvent;
            this.activationState_ = this.defaultActivationState_();
            // Touch devices may fire additional events for the same interaction within a short time.
            // Store the previous event until it's safe to assume that subsequent events are for new interactions.
            setTimeout(function () { return _this.previousActivationEvent_ = undefined; }, MDCRippleFoundation.numbers.TAP_DELAY_MS);
        };
        MDCRippleFoundation.prototype.deactivate_ = function () {
            var _this = this;
            var activationState = this.activationState_;
            // This can happen in scenarios such as when you have a keyup event that blurs the element.
            if (!activationState.isActivated) {
                return;
            }
            var state = __assign({}, activationState);
            if (activationState.isProgrammatic) {
                requestAnimationFrame(function () { return _this.animateDeactivation_(state); });
                this.resetActivationState_();
            }
            else {
                this.deregisterDeactivationHandlers_();
                requestAnimationFrame(function () {
                    _this.activationState_.hasDeactivationUXRun = true;
                    _this.animateDeactivation_(state);
                    _this.resetActivationState_();
                });
            }
        };
        MDCRippleFoundation.prototype.animateDeactivation_ = function (_a) {
            var wasActivatedByPointer = _a.wasActivatedByPointer, wasElementMadeActive = _a.wasElementMadeActive;
            if (wasActivatedByPointer || wasElementMadeActive) {
                this.runDeactivationUXLogicIfReady_();
            }
        };
        MDCRippleFoundation.prototype.layoutInternal_ = function () {
            var _this = this;
            this.frame_ = this.adapter_.computeBoundingRect();
            var maxDim = Math.max(this.frame_.height, this.frame_.width);
            // Surface diameter is treated differently for unbounded vs. bounded ripples.
            // Unbounded ripple diameter is calculated smaller since the surface is expected to already be padded appropriately
            // to extend the hitbox, and the ripple is expected to meet the edges of the padded hitbox (which is typically
            // square). Bounded ripples, on the other hand, are fully expected to expand beyond the surface's longest diameter
            // (calculated based on the diagonal plus a constant padding), and are clipped at the surface's border via
            // `overflow: hidden`.
            var getBoundedRadius = function () {
                var hypotenuse = Math.sqrt(Math.pow(_this.frame_.width, 2) + Math.pow(_this.frame_.height, 2));
                return hypotenuse + MDCRippleFoundation.numbers.PADDING;
            };
            this.maxRadius_ = this.adapter_.isUnbounded() ? maxDim : getBoundedRadius();
            // Ripple is sized as a fraction of the largest dimension of the surface, then scales up using a CSS scale transform
            this.initialSize_ = Math.floor(maxDim * MDCRippleFoundation.numbers.INITIAL_ORIGIN_SCALE);
            this.fgScale_ = "" + this.maxRadius_ / this.initialSize_;
            this.updateLayoutCssVars_();
        };
        MDCRippleFoundation.prototype.updateLayoutCssVars_ = function () {
            var _a = MDCRippleFoundation.strings, VAR_FG_SIZE = _a.VAR_FG_SIZE, VAR_LEFT = _a.VAR_LEFT, VAR_TOP = _a.VAR_TOP, VAR_FG_SCALE = _a.VAR_FG_SCALE;
            this.adapter_.updateCssVariable(VAR_FG_SIZE, this.initialSize_ + "px");
            this.adapter_.updateCssVariable(VAR_FG_SCALE, this.fgScale_);
            if (this.adapter_.isUnbounded()) {
                this.unboundedCoords_ = {
                    left: Math.round((this.frame_.width / 2) - (this.initialSize_ / 2)),
                    top: Math.round((this.frame_.height / 2) - (this.initialSize_ / 2)),
                };
                this.adapter_.updateCssVariable(VAR_LEFT, this.unboundedCoords_.left + "px");
                this.adapter_.updateCssVariable(VAR_TOP, this.unboundedCoords_.top + "px");
            }
        };
        return MDCRippleFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCRipple = /** @class */ (function (_super) {
        __extends(MDCRipple, _super);
        function MDCRipple() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.disabled = false;
            return _this;
        }
        MDCRipple.attachTo = function (root, opts) {
            if (opts === void 0) { opts = { isUnbounded: undefined }; }
            var ripple = new MDCRipple(root);
            // Only override unbounded behavior if option is explicitly specified
            if (opts.isUnbounded !== undefined) {
                ripple.unbounded = opts.isUnbounded;
            }
            return ripple;
        };
        MDCRipple.createAdapter = function (instance) {
            return {
                addClass: function (className) { return instance.root_.classList.add(className); },
                browserSupportsCssVars: function () { return supportsCssVariables(window); },
                computeBoundingRect: function () { return instance.root_.getBoundingClientRect(); },
                containsEventTarget: function (target) { return instance.root_.contains(target); },
                deregisterDocumentInteractionHandler: function (evtType, handler) {
                    return document.documentElement.removeEventListener(evtType, handler, applyPassive());
                },
                deregisterInteractionHandler: function (evtType, handler) {
                    return instance.root_.removeEventListener(evtType, handler, applyPassive());
                },
                deregisterResizeHandler: function (handler) { return window.removeEventListener('resize', handler); },
                getWindowPageOffset: function () { return ({ x: window.pageXOffset, y: window.pageYOffset }); },
                isSurfaceActive: function () { return matches$1(instance.root_, ':active'); },
                isSurfaceDisabled: function () { return Boolean(instance.disabled); },
                isUnbounded: function () { return Boolean(instance.unbounded); },
                registerDocumentInteractionHandler: function (evtType, handler) {
                    return document.documentElement.addEventListener(evtType, handler, applyPassive());
                },
                registerInteractionHandler: function (evtType, handler) {
                    return instance.root_.addEventListener(evtType, handler, applyPassive());
                },
                registerResizeHandler: function (handler) { return window.addEventListener('resize', handler); },
                removeClass: function (className) { return instance.root_.classList.remove(className); },
                updateCssVariable: function (varName, value) { return instance.root_.style.setProperty(varName, value); },
            };
        };
        Object.defineProperty(MDCRipple.prototype, "unbounded", {
            get: function () {
                return Boolean(this.unbounded_);
            },
            set: function (unbounded) {
                this.unbounded_ = Boolean(unbounded);
                this.setUnbounded_();
            },
            enumerable: true,
            configurable: true
        });
        MDCRipple.prototype.activate = function () {
            this.foundation_.activate();
        };
        MDCRipple.prototype.deactivate = function () {
            this.foundation_.deactivate();
        };
        MDCRipple.prototype.layout = function () {
            this.foundation_.layout();
        };
        MDCRipple.prototype.getDefaultFoundation = function () {
            return new MDCRippleFoundation(MDCRipple.createAdapter(this));
        };
        MDCRipple.prototype.initialSyncWithDOM = function () {
            var root = this.root_;
            this.unbounded = 'mdcRippleIsUnbounded' in root.dataset;
        };
        /**
         * Closure Compiler throws an access control error when directly accessing a
         * protected or private property inside a getter/setter, like unbounded above.
         * By accessing the protected property inside a method, we solve that problem.
         * That's why this function exists.
         */
        MDCRipple.prototype.setUnbounded_ = function () {
            this.foundation_.setUnbounded(Boolean(this.unbounded_));
        };
        return MDCRipple;
    }(MDCComponent));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$4 = {
        FIXED_CLASS: 'mdc-top-app-bar--fixed',
        FIXED_SCROLLED_CLASS: 'mdc-top-app-bar--fixed-scrolled',
        SHORT_CLASS: 'mdc-top-app-bar--short',
        SHORT_COLLAPSED_CLASS: 'mdc-top-app-bar--short-collapsed',
        SHORT_HAS_ACTION_ITEM_CLASS: 'mdc-top-app-bar--short-has-action-item',
    };
    var numbers$2 = {
        DEBOUNCE_THROTTLE_RESIZE_TIME_MS: 100,
        MAX_TOP_APP_BAR_HEIGHT: 128,
    };
    var strings$4 = {
        ACTION_ITEM_SELECTOR: '.mdc-top-app-bar__action-item',
        NAVIGATION_EVENT: 'MDCTopAppBar:nav',
        NAVIGATION_ICON_SELECTOR: '.mdc-top-app-bar__navigation-icon',
        ROOT_SELECTOR: '.mdc-top-app-bar',
        TITLE_SELECTOR: '.mdc-top-app-bar__title',
    };

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCTopAppBarBaseFoundation = /** @class */ (function (_super) {
        __extends(MDCTopAppBarBaseFoundation, _super);
        /* istanbul ignore next: optional argument is not a branch statement */
        function MDCTopAppBarBaseFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCTopAppBarBaseFoundation.defaultAdapter, adapter)) || this;
            _this.navClickHandler_ = function () { return _this.adapter_.notifyNavigationIconClicked(); };
            return _this;
        }
        Object.defineProperty(MDCTopAppBarBaseFoundation, "strings", {
            get: function () {
                return strings$4;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTopAppBarBaseFoundation, "cssClasses", {
            get: function () {
                return cssClasses$4;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTopAppBarBaseFoundation, "numbers", {
            get: function () {
                return numbers$2;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTopAppBarBaseFoundation, "defaultAdapter", {
            /**
             * See {@link MDCTopAppBarAdapter} for typing information on parameters and return types.
             */
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    hasClass: function () { return false; },
                    setStyle: function () { return undefined; },
                    getTopAppBarHeight: function () { return 0; },
                    registerNavigationIconInteractionHandler: function () { return undefined; },
                    deregisterNavigationIconInteractionHandler: function () { return undefined; },
                    notifyNavigationIconClicked: function () { return undefined; },
                    registerScrollHandler: function () { return undefined; },
                    deregisterScrollHandler: function () { return undefined; },
                    registerResizeHandler: function () { return undefined; },
                    deregisterResizeHandler: function () { return undefined; },
                    getViewportScrollY: function () { return 0; },
                    getTotalActionItems: function () { return 0; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCTopAppBarBaseFoundation.prototype.init = function () {
            this.initScrollHandler();
            this.initResizeHandler_();
            this.adapter_.registerNavigationIconInteractionHandler('click', this.navClickHandler_);
        };
        MDCTopAppBarBaseFoundation.prototype.destroy = function () {
            this.destroyScrollHandler();
            this.destroyResizeHandler_();
            this.adapter_.deregisterNavigationIconInteractionHandler('click', this.navClickHandler_);
        };
        MDCTopAppBarBaseFoundation.prototype.initScrollHandler = function () {
            if (this.scrollHandler_) {
                this.adapter_.registerScrollHandler(this.scrollHandler_);
            }
        };
        MDCTopAppBarBaseFoundation.prototype.destroyScrollHandler = function () {
            if (this.scrollHandler_) {
                this.adapter_.deregisterScrollHandler(this.scrollHandler_);
            }
        };
        MDCTopAppBarBaseFoundation.prototype.initResizeHandler_ = function () {
            if (this.resizeHandler_) {
                this.adapter_.registerResizeHandler(this.resizeHandler_);
            }
        };
        MDCTopAppBarBaseFoundation.prototype.destroyResizeHandler_ = function () {
            if (this.resizeHandler_) {
                this.adapter_.deregisterResizeHandler(this.resizeHandler_);
            }
        };
        return MDCTopAppBarBaseFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var INITIAL_VALUE = 0;
    var MDCTopAppBarFoundation = /** @class */ (function (_super) {
        __extends(MDCTopAppBarFoundation, _super);
        /* istanbul ignore next: optional argument is not a branch statement */
        function MDCTopAppBarFoundation(adapter) {
            var _this = _super.call(this, adapter) || this;
            /**
             * Indicates if the top app bar was docked in the previous scroll handler iteration.
             */
            _this.wasDocked_ = true;
            /**
             * Indicates if the top app bar is docked in the fully shown position.
             */
            _this.isDockedShowing_ = true;
            /**
             * Variable for current scroll position of the top app bar
             */
            _this.currentAppBarOffsetTop_ = 0;
            /**
             * Used to prevent the top app bar from being scrolled out of view during resize events
             */
            _this.isCurrentlyBeingResized_ = false;
            /**
             * The timeout that's used to throttle the resize events
             */
            _this.resizeThrottleId_ = INITIAL_VALUE;
            /**
             * The timeout that's used to debounce toggling the isCurrentlyBeingResized_ variable after a resize
             */
            _this.resizeDebounceId_ = INITIAL_VALUE;
            _this.lastScrollPosition_ = _this.adapter_.getViewportScrollY();
            _this.topAppBarHeight_ = _this.adapter_.getTopAppBarHeight();
            _this.scrollHandler_ = function () { return _this.topAppBarScrollHandler_(); };
            _this.resizeHandler_ = function () { return _this.topAppBarResizeHandler_(); };
            return _this;
        }
        MDCTopAppBarFoundation.prototype.destroy = function () {
            _super.prototype.destroy.call(this);
            this.adapter_.setStyle('top', '');
        };
        /**
         * Function to determine if the DOM needs to update.
         */
        MDCTopAppBarFoundation.prototype.checkForUpdate_ = function () {
            var offscreenBoundaryTop = -this.topAppBarHeight_;
            var hasAnyPixelsOffscreen = this.currentAppBarOffsetTop_ < 0;
            var hasAnyPixelsOnscreen = this.currentAppBarOffsetTop_ > offscreenBoundaryTop;
            var partiallyShowing = hasAnyPixelsOffscreen && hasAnyPixelsOnscreen;
            // If it's partially showing, it can't be docked.
            if (partiallyShowing) {
                this.wasDocked_ = false;
            }
            else {
                // Not previously docked and not partially showing, it's now docked.
                if (!this.wasDocked_) {
                    this.wasDocked_ = true;
                    return true;
                }
                else if (this.isDockedShowing_ !== hasAnyPixelsOnscreen) {
                    this.isDockedShowing_ = hasAnyPixelsOnscreen;
                    return true;
                }
            }
            return partiallyShowing;
        };
        /**
         * Function to move the top app bar if needed.
         */
        MDCTopAppBarFoundation.prototype.moveTopAppBar_ = function () {
            if (this.checkForUpdate_()) {
                // Once the top app bar is fully hidden we use the max potential top app bar height as our offset
                // so the top app bar doesn't show if the window resizes and the new height > the old height.
                var offset = this.currentAppBarOffsetTop_;
                if (Math.abs(offset) >= this.topAppBarHeight_) {
                    offset = -numbers$2.MAX_TOP_APP_BAR_HEIGHT;
                }
                this.adapter_.setStyle('top', offset + 'px');
            }
        };
        /**
         * Scroll handler for the default scroll behavior of the top app bar.
         */
        MDCTopAppBarFoundation.prototype.topAppBarScrollHandler_ = function () {
            var currentScrollPosition = Math.max(this.adapter_.getViewportScrollY(), 0);
            var diff = currentScrollPosition - this.lastScrollPosition_;
            this.lastScrollPosition_ = currentScrollPosition;
            // If the window is being resized the lastScrollPosition_ needs to be updated but the
            // current scroll of the top app bar should stay in the same position.
            if (!this.isCurrentlyBeingResized_) {
                this.currentAppBarOffsetTop_ -= diff;
                if (this.currentAppBarOffsetTop_ > 0) {
                    this.currentAppBarOffsetTop_ = 0;
                }
                else if (Math.abs(this.currentAppBarOffsetTop_) > this.topAppBarHeight_) {
                    this.currentAppBarOffsetTop_ = -this.topAppBarHeight_;
                }
                this.moveTopAppBar_();
            }
        };
        /**
         * Top app bar resize handler that throttle/debounce functions that execute updates.
         */
        MDCTopAppBarFoundation.prototype.topAppBarResizeHandler_ = function () {
            var _this = this;
            // Throttle resize events 10 p/s
            if (!this.resizeThrottleId_) {
                this.resizeThrottleId_ = setTimeout(function () {
                    _this.resizeThrottleId_ = INITIAL_VALUE;
                    _this.throttledResizeHandler_();
                }, numbers$2.DEBOUNCE_THROTTLE_RESIZE_TIME_MS);
            }
            this.isCurrentlyBeingResized_ = true;
            if (this.resizeDebounceId_) {
                clearTimeout(this.resizeDebounceId_);
            }
            this.resizeDebounceId_ = setTimeout(function () {
                _this.topAppBarScrollHandler_();
                _this.isCurrentlyBeingResized_ = false;
                _this.resizeDebounceId_ = INITIAL_VALUE;
            }, numbers$2.DEBOUNCE_THROTTLE_RESIZE_TIME_MS);
        };
        /**
         * Throttled function that updates the top app bar scrolled values if the
         * top app bar height changes.
         */
        MDCTopAppBarFoundation.prototype.throttledResizeHandler_ = function () {
            var currentHeight = this.adapter_.getTopAppBarHeight();
            if (this.topAppBarHeight_ !== currentHeight) {
                this.wasDocked_ = false;
                // Since the top app bar has a different height depending on the screen width, this
                // will ensure that the top app bar remains in the correct location if
                // completely hidden and a resize makes the top app bar a different height.
                this.currentAppBarOffsetTop_ -= this.topAppBarHeight_ - currentHeight;
                this.topAppBarHeight_ = currentHeight;
            }
            this.topAppBarScrollHandler_();
        };
        return MDCTopAppBarFoundation;
    }(MDCTopAppBarBaseFoundation));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCFixedTopAppBarFoundation = /** @class */ (function (_super) {
        __extends(MDCFixedTopAppBarFoundation, _super);
        /* istanbul ignore next: optional argument is not a branch statement */
        function MDCFixedTopAppBarFoundation(adapter) {
            var _this = _super.call(this, adapter) || this;
            /**
             * State variable for the previous scroll iteration top app bar state
             */
            _this.wasScrolled_ = false;
            _this.scrollHandler_ = function () { return _this.fixedScrollHandler_(); };
            return _this;
        }
        /**
         * Scroll handler for applying/removing the modifier class on the fixed top app bar.
         */
        MDCFixedTopAppBarFoundation.prototype.fixedScrollHandler_ = function () {
            var currentScroll = this.adapter_.getViewportScrollY();
            if (currentScroll <= 0) {
                if (this.wasScrolled_) {
                    this.adapter_.removeClass(cssClasses$4.FIXED_SCROLLED_CLASS);
                    this.wasScrolled_ = false;
                }
            }
            else {
                if (!this.wasScrolled_) {
                    this.adapter_.addClass(cssClasses$4.FIXED_SCROLLED_CLASS);
                    this.wasScrolled_ = true;
                }
            }
        };
        return MDCFixedTopAppBarFoundation;
    }(MDCTopAppBarFoundation));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCShortTopAppBarFoundation = /** @class */ (function (_super) {
        __extends(MDCShortTopAppBarFoundation, _super);
        /* istanbul ignore next: optional argument is not a branch statement */
        function MDCShortTopAppBarFoundation(adapter) {
            var _this = _super.call(this, adapter) || this;
            _this.isCollapsed_ = false;
            return _this;
        }
        Object.defineProperty(MDCShortTopAppBarFoundation.prototype, "isCollapsed", {
            // Public visibility for backward compatibility.
            get: function () {
                return this.isCollapsed_;
            },
            enumerable: true,
            configurable: true
        });
        MDCShortTopAppBarFoundation.prototype.init = function () {
            var _this = this;
            _super.prototype.init.call(this);
            if (this.adapter_.getTotalActionItems() > 0) {
                this.adapter_.addClass(cssClasses$4.SHORT_HAS_ACTION_ITEM_CLASS);
            }
            if (!this.adapter_.hasClass(cssClasses$4.SHORT_COLLAPSED_CLASS)) {
                this.scrollHandler_ = function () { return _this.shortAppBarScrollHandler_(); };
                this.adapter_.registerScrollHandler(this.scrollHandler_);
                this.shortAppBarScrollHandler_();
            }
        };
        MDCShortTopAppBarFoundation.prototype.destroy = function () {
            _super.prototype.destroy.call(this);
        };
        /**
         * Scroll handler for applying/removing the collapsed modifier class on the short top app bar.
         */
        MDCShortTopAppBarFoundation.prototype.shortAppBarScrollHandler_ = function () {
            var currentScroll = this.adapter_.getViewportScrollY();
            if (currentScroll <= 0) {
                if (this.isCollapsed_) {
                    this.adapter_.removeClass(cssClasses$4.SHORT_COLLAPSED_CLASS);
                    this.isCollapsed_ = false;
                }
            }
            else {
                if (!this.isCollapsed_) {
                    this.adapter_.addClass(cssClasses$4.SHORT_COLLAPSED_CLASS);
                    this.isCollapsed_ = true;
                }
            }
        };
        return MDCShortTopAppBarFoundation;
    }(MDCTopAppBarBaseFoundation));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCTopAppBar = /** @class */ (function (_super) {
        __extends(MDCTopAppBar, _super);
        function MDCTopAppBar() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTopAppBar.attachTo = function (root) {
            return new MDCTopAppBar(root);
        };
        MDCTopAppBar.prototype.initialize = function (rippleFactory) {
            if (rippleFactory === void 0) { rippleFactory = function (el) { return MDCRipple.attachTo(el); }; }
            this.navIcon_ = this.root_.querySelector(strings$4.NAVIGATION_ICON_SELECTOR);
            // Get all icons in the toolbar and instantiate the ripples
            var icons = [].slice.call(this.root_.querySelectorAll(strings$4.ACTION_ITEM_SELECTOR));
            if (this.navIcon_) {
                icons.push(this.navIcon_);
            }
            this.iconRipples_ = icons.map(function (icon) {
                var ripple = rippleFactory(icon);
                ripple.unbounded = true;
                return ripple;
            });
            this.scrollTarget_ = window;
        };
        MDCTopAppBar.prototype.destroy = function () {
            this.iconRipples_.forEach(function (iconRipple) { return iconRipple.destroy(); });
            _super.prototype.destroy.call(this);
        };
        MDCTopAppBar.prototype.setScrollTarget = function (target) {
            // Remove scroll handler from the previous scroll target
            this.foundation_.destroyScrollHandler();
            this.scrollTarget_ = target;
            // Initialize scroll handler on the new scroll target
            this.foundation_.initScrollHandler();
        };
        MDCTopAppBar.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                setStyle: function (property, value) { return _this.root_.style.setProperty(property, value); },
                getTopAppBarHeight: function () { return _this.root_.clientHeight; },
                registerNavigationIconInteractionHandler: function (evtType, handler) {
                    if (_this.navIcon_) {
                        _this.navIcon_.addEventListener(evtType, handler);
                    }
                },
                deregisterNavigationIconInteractionHandler: function (evtType, handler) {
                    if (_this.navIcon_) {
                        _this.navIcon_.removeEventListener(evtType, handler);
                    }
                },
                notifyNavigationIconClicked: function () { return _this.emit(strings$4.NAVIGATION_EVENT, {}); },
                registerScrollHandler: function (handler) { return _this.scrollTarget_.addEventListener('scroll', handler); },
                deregisterScrollHandler: function (handler) { return _this.scrollTarget_.removeEventListener('scroll', handler); },
                registerResizeHandler: function (handler) { return window.addEventListener('resize', handler); },
                deregisterResizeHandler: function (handler) { return window.removeEventListener('resize', handler); },
                getViewportScrollY: function () {
                    var win = _this.scrollTarget_;
                    var el = _this.scrollTarget_;
                    return win.pageYOffset !== undefined ? win.pageYOffset : el.scrollTop;
                },
                getTotalActionItems: function () { return _this.root_.querySelectorAll(strings$4.ACTION_ITEM_SELECTOR).length; },
            };
            // tslint:enable:object-literal-sort-keys
            var foundation;
            if (this.root_.classList.contains(cssClasses$4.SHORT_CLASS)) {
                foundation = new MDCShortTopAppBarFoundation(adapter);
            }
            else if (this.root_.classList.contains(cssClasses$4.FIXED_CLASS)) {
                foundation = new MDCFixedTopAppBarFoundation(adapter);
            }
            else {
                foundation = new MDCTopAppBarFoundation(adapter);
            }
            return foundation;
        };
        return MDCTopAppBar;
    }(MDCComponent));

    /* src\components\TopAppBar\TopAppBar.svelte generated by Svelte v3.6.1 */

    const get_actions_slot_changes = ({}) => ({});
    const get_actions_slot_context = ({}) => ({});

    const get_navigation_slot_changes = ({}) => ({});
    const get_navigation_slot_context = ({}) => ({});

    // (60:4) {#if slots['navigation'] || title}
    function create_if_block_1$1(ctx) {
    	var section, t, current;

    	const navigation_slot_1 = ctx.$$slots.navigation;
    	const navigation_slot = create_slot(navigation_slot_1, ctx, get_navigation_slot_context);

    	var if_block = (ctx.title) && create_if_block_2(ctx);

    	return {
    		c() {
    			section = element("section");

    			if (navigation_slot) navigation_slot.c();
    			t = space();
    			if (if_block) if_block.c();

    			attr(section, "class", "mdc-top-app-bar__section mdc-top-app-bar__section--align-start");
    		},

    		l(nodes) {
    			if (navigation_slot) navigation_slot.l(section_nodes);
    		},

    		m(target, anchor) {
    			insert(target, section, anchor);

    			if (navigation_slot) {
    				navigation_slot.m(section, null);
    			}

    			append(section, t);
    			if (if_block) if_block.m(section, null);
    			current = true;
    		},

    		p(changed, ctx) {
    			if (navigation_slot && navigation_slot.p && changed.$$scope) {
    				navigation_slot.p(get_slot_changes(navigation_slot_1, ctx, changed, get_navigation_slot_changes), get_slot_context(navigation_slot_1, ctx, get_navigation_slot_context));
    			}

    			if (ctx.title) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					if_block.m(section, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(navigation_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(navigation_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(section);
    			}

    			if (navigation_slot) navigation_slot.d(detaching);
    			if (if_block) if_block.d();
    		}
    	};
    }

    // (63:6) {#if title}
    function create_if_block_2(ctx) {
    	var span, t;

    	return {
    		c() {
    			span = element("span");
    			t = text(ctx.title);
    			attr(span, "class", "mdc-top-app-bar__title");
    		},

    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},

    		p(changed, ctx) {
    			if (changed.title) {
    				set_data(t, ctx.title);
    			}
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (71:4) {#if slots['actions']}
    function create_if_block$2(ctx) {
    	var section, current;

    	const actions_slot_1 = ctx.$$slots.actions;
    	const actions_slot = create_slot(actions_slot_1, ctx, get_actions_slot_context);

    	return {
    		c() {
    			section = element("section");

    			if (actions_slot) actions_slot.c();

    			attr(section, "class", "mdc-top-app-bar__section mdc-top-app-bar__section--align-end");
    			attr(section, "role", "toolbar");
    		},

    		l(nodes) {
    			if (actions_slot) actions_slot.l(section_nodes);
    		},

    		m(target, anchor) {
    			insert(target, section, anchor);

    			if (actions_slot) {
    				actions_slot.m(section, null);
    			}

    			current = true;
    		},

    		p(changed, ctx) {
    			if (actions_slot && actions_slot.p && changed.$$scope) {
    				actions_slot.p(get_slot_changes(actions_slot_1, ctx, changed, get_actions_slot_changes), get_slot_context(actions_slot_1, ctx, get_actions_slot_context));
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(actions_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(actions_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(section);
    			}

    			if (actions_slot) actions_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	var header, div, t0, t1, current;

    	var if_block0 = (ctx.slots['navigation'] || ctx.title) && create_if_block_1$1(ctx);

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	var if_block1 = (ctx.slots['actions']) && create_if_block$2(ctx);

    	var header_levels = [
    		ctx.attrs
    	];

    	var header_data = {};
    	for (var i = 0; i < header_levels.length; i += 1) {
    		header_data = assign(header_data, header_levels[i]);
    	}

    	return {
    		c() {
    			header = element("header");
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();

    			if (default_slot) default_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();

    			attr(div, "class", "mdc-top-app-bar__row");
    			set_attributes(header, header_data);
    		},

    		l(nodes) {
    			if (default_slot) default_slot.l(div_nodes);
    		},

    		m(target, anchor) {
    			insert(target, header, anchor);
    			append(header, div);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			add_binding_callback(() => ctx.header_binding(header, null));
    			current = true;
    		},

    		p(changed, ctx) {
    			if (ctx.slots['navigation'] || ctx.title) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_1$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				group_outros();
    				transition_out(if_block0, 1, () => {
    					if_block0 = null;
    				});
    				check_outros();
    			}

    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (ctx.slots['actions']) {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block$2(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();
    				transition_out(if_block1, 1, () => {
    					if_block1 = null;
    				});
    				check_outros();
    			}

    			if (changed.items) {
    				ctx.header_binding(null, header);
    				ctx.header_binding(header, null);
    			}

    			set_attributes(header, get_spread_update(header_levels, [
    				(changed.attrs) && ctx.attrs
    			]));
    		},

    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(default_slot, local);
    			transition_in(if_block1);
    			current = true;
    		},

    		o(local) {
    			transition_out(if_block0);
    			transition_out(default_slot, local);
    			transition_out(if_block1);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(header);
    			}

    			if (if_block0) if_block0.d();

    			if (default_slot) default_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			ctx.header_binding(null, header);
    		}
    	};
    }

    const navClass = 'mdc-top-app-bar__navigation-icon';

    const actionClass = 'mdc-top-app-bar__action-item';

    function instance$4($$self, $$props, $$invalidate) {
    	

      const dispatch = createEventDispatcher();
      let { self = null, attrs = [], title } = $$props;
      
      let slots = $$props.$$slots || {};
      
      let mdcComponent;
      onMount(() => {
        addClassToSlot(self, 'navigation', navClass);
        addClassToSlotNodes(self, 'actions', actionClass);

        mdcComponent = new MDCTopAppBar(self);
        mdcComponent.listen('MDCTopAppBar:nav', (e) => {
          status = undefined;
          dispatch('nav', e);
        });
      });

      onDestroy(() => {
        mdcComponent.destroy();
      });

    	let { $$slots = {}, $$scope } = $$props;

    	function header_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate('$$props', $$props = assign(assign({}, $$props), $$new_props));
    		if ('self' in $$new_props) $$invalidate('self', self = $$new_props.self);
    		if ('attrs' in $$new_props) $$invalidate('attrs', attrs = $$new_props.attrs);
    		if ('title' in $$new_props) $$invalidate('title', title = $$new_props.title);
    		if ('$$scope' in $$new_props) $$invalidate('$$scope', $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { $$props: 1 }) => {
    		{
            let result = Object.assign({}, $$props);
            let cls = 'mdc-top-app-bar';
            let classes = [cls];
            for (let key of [
              'short',
              'short-collapsed',
              'fixed',
              'prominent',
              'dense'
            ]) {
              if (result[key]) {
                classes.push(cls + '--' + key);
              }
              delete result[key];
            }
            result['class'] = processClasses(classes, result['class']);
            $$invalidate('attrs', attrs = result);
          }
    	};

    	return {
    		self,
    		attrs,
    		title,
    		slots,
    		header_binding,
    		$$props: $$props = exclude_internal_props($$props),
    		$$slots,
    		$$scope
    	};
    }

    class TopAppBar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, ["self", "attrs", "title"]);
    	}
    }

    /* src\components\TopAppBar\TopAppBarFixedAdjust.svelte generated by Svelte v3.6.1 */

    function create_fragment$5(ctx) {
    	var div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", ctx.classes);
    		},

    		m(target, anchor) {
    			insert(target, div, anchor);
    		},

    		p(changed, ctx) {
    			if (changed.classes) {
    				attr(div, "class", ctx.classes);
    			}
    		},

    		i: noop,
    		o: noop,

    		d(detaching) {
    			if (detaching) {
    				detach(div);
    			}
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { dense = false, short = false, prominent = false, denseProminent = false } = $$props;

    	$$self.$set = $$props => {
    		if ('dense' in $$props) $$invalidate('dense', dense = $$props.dense);
    		if ('short' in $$props) $$invalidate('short', short = $$props.short);
    		if ('prominent' in $$props) $$invalidate('prominent', prominent = $$props.prominent);
    		if ('denseProminent' in $$props) $$invalidate('denseProminent', denseProminent = $$props.denseProminent);
    	};

    	let classes;

    	$$self.$$.update = ($$dirty = { dense: 1, short: 1, prominent: 1, denseProminent: 1 }) => {
    		if ($$dirty.dense || $$dirty.short || $$dirty.prominent || $$dirty.denseProminent) { $$invalidate('classes', classes = buildClasses({
              'mdc-top-app-bar--dense-fixed-adjust': dense && !short,
              'mdc-top-app-bar--short-fixed-adjust': short,
              'mdc-top-app-bar--prominent-fixed-adjust': prominent && !short,
              'mdc-top-app-bar--dense-prominent-fixed-adjust': denseProminent && !short
            }, ['mdc-top-app-bar--fixed-adjust'])); }
    	};

    	return {
    		dense,
    		short,
    		prominent,
    		denseProminent,
    		classes
    	};
    }

    class TopAppBarFixedAdjust extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, ["dense", "short", "prominent", "denseProminent"]);
    	}
    }

    /* src\components\List\LinkListItem.svelte generated by Svelte v3.6.1 */

    const get_meta_slot_changes = ({}) => ({});
    const get_meta_slot_context = ({}) => ({});

    const get_graphic_slot_changes = ({}) => ({});
    const get_graphic_slot_context = ({}) => ({});

    // (30:2) {#if showGraphic}
    function create_if_block_3(ctx) {
    	var span, current;

    	const graphic_slot_1 = ctx.$$slots.graphic;
    	const graphic_slot = create_slot(graphic_slot_1, ctx, get_graphic_slot_context);

    	return {
    		c() {
    			span = element("span");

    			if (graphic_slot) graphic_slot.c();

    			attr(span, "role", "presentation");
    			attr(span, "class", "mdc-list-item__graphic");
    		},

    		l(nodes) {
    			if (graphic_slot) graphic_slot.l(span_nodes);
    		},

    		m(target, anchor) {
    			insert(target, span, anchor);

    			if (graphic_slot) {
    				graphic_slot.m(span, null);
    			}

    			current = true;
    		},

    		p(changed, ctx) {
    			if (graphic_slot && graphic_slot.p && changed.$$scope) {
    				graphic_slot.p(get_slot_changes(graphic_slot_1, ctx, changed, get_graphic_slot_changes), get_slot_context(graphic_slot_1, ctx, get_graphic_slot_context));
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(graphic_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(graphic_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			if (graphic_slot) graphic_slot.d(detaching);
    		}
    	};
    }

    // (42:2) {:else}
    function create_else_block(ctx) {
    	var current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},

    		l(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},

    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},

    		p(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (34:8) {#if primaryText}
    function create_if_block_1$2(ctx) {
    	var span, t0, t1;

    	var if_block = (ctx.secondText) && create_if_block_2$1(ctx);

    	return {
    		c() {
    			span = element("span");
    			t0 = text(ctx.primaryText);
    			t1 = space();
    			if (if_block) if_block.c();
    			attr(span, "class", "mdc-list-item__text");
    		},

    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			append(span, t1);
    			if (if_block) if_block.m(span, null);
    		},

    		p(changed, ctx) {
    			if (changed.primaryText) {
    				set_data(t0, ctx.primaryText);
    			}

    			if (ctx.secondText) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_2$1(ctx);
    					if_block.c();
    					if_block.m(span, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},

    		i: noop,
    		o: noop,

    		d(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			if (if_block) if_block.d();
    		}
    	};
    }

    // (36:18) {#if secondText}
    function create_if_block_2$1(ctx) {
    	var span, t;

    	return {
    		c() {
    			span = element("span");
    			t = text(ctx.secondText);
    			attr(span, "class", "mdc-list-item__secondary-text");
    		},

    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},

    		p(changed, ctx) {
    			if (changed.secondText) {
    				set_data(t, ctx.secondText);
    			}
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (44:8) {#if showMeta}
    function create_if_block$3(ctx) {
    	var span, current;

    	const meta_slot_1 = ctx.$$slots.meta;
    	const meta_slot = create_slot(meta_slot_1, ctx, get_meta_slot_context);

    	return {
    		c() {
    			span = element("span");

    			if (meta_slot) meta_slot.c();

    			attr(span, "role", "presentation");
    			attr(span, "class", "mdc-list-item__meta");
    		},

    		l(nodes) {
    			if (meta_slot) meta_slot.l(span_nodes);
    		},

    		m(target, anchor) {
    			insert(target, span, anchor);

    			if (meta_slot) {
    				meta_slot.m(span, null);
    			}

    			current = true;
    		},

    		p(changed, ctx) {
    			if (meta_slot && meta_slot.p && changed.$$scope) {
    				meta_slot.p(get_slot_changes(meta_slot_1, ctx, changed, get_meta_slot_changes), get_slot_context(meta_slot_1, ctx, get_meta_slot_context));
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(meta_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(meta_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			if (meta_slot) meta_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	var a, t0, current_block_type_index, if_block1, t1, current;

    	var if_block0 = (ctx.showGraphic) && create_if_block_3(ctx);

    	var if_block_creators = [
    		create_if_block_1$2,
    		create_else_block
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.primaryText) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	var if_block2 = (ctx.showMeta) && create_if_block$3(ctx);

    	var a_levels = [
    		{ href: "#!" },
    		ctx.attrs
    	];

    	var a_data = {};
    	for (var i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	return {
    		c() {
    			a = element("a");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			set_attributes(a, a_data);
    		},

    		m(target, anchor) {
    			insert(target, a, anchor);
    			if (if_block0) if_block0.m(a, null);
    			append(a, t0);
    			if_blocks[current_block_type_index].m(a, null);
    			append(a, t1);
    			if (if_block2) if_block2.m(a, null);
    			current = true;
    		},

    		p(changed, ctx) {
    			if (ctx.showGraphic) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(a, t0);
    				}
    			} else if (if_block0) {
    				group_outros();
    				transition_out(if_block0, 1, () => {
    					if_block0 = null;
    				});
    				check_outros();
    			}

    			var previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);
    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();
    				transition_out(if_blocks[previous_block_index], 1, () => {
    					if_blocks[previous_block_index] = null;
    				});
    				check_outros();

    				if_block1 = if_blocks[current_block_type_index];
    				if (!if_block1) {
    					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block1.c();
    				}
    				transition_in(if_block1, 1);
    				if_block1.m(a, t1);
    			}

    			if (ctx.showMeta) {
    				if (if_block2) {
    					if_block2.p(changed, ctx);
    					transition_in(if_block2, 1);
    				} else {
    					if_block2 = create_if_block$3(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(a, null);
    				}
    			} else if (if_block2) {
    				group_outros();
    				transition_out(if_block2, 1, () => {
    					if_block2 = null;
    				});
    				check_outros();
    			}

    			set_attributes(a, get_spread_update(a_levels, [
    				{ href: "#!" },
    				(changed.attrs) && ctx.attrs
    			]));
    		},

    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},

    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(a);
    			}

    			if (if_block0) if_block0.d();
    			if_blocks[current_block_type_index].d();
    			if (if_block2) if_block2.d();
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { showGraphic = false, primaryText='', secondText='', showMeta = false, attrs } = $$props;

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate('$$props', $$props = assign(assign({}, $$props), $$new_props));
    		if ('showGraphic' in $$new_props) $$invalidate('showGraphic', showGraphic = $$new_props.showGraphic);
    		if ('primaryText' in $$new_props) $$invalidate('primaryText', primaryText = $$new_props.primaryText);
    		if ('secondText' in $$new_props) $$invalidate('secondText', secondText = $$new_props.secondText);
    		if ('showMeta' in $$new_props) $$invalidate('showMeta', showMeta = $$new_props.showMeta);
    		if ('attrs' in $$new_props) $$invalidate('attrs', attrs = $$new_props.attrs);
    		if ('$$scope' in $$new_props) $$invalidate('$$scope', $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { $$props: 1 }) => {
    		{
            let result = Object.assign({}, $$props);
            let cls = 'mdc-list-item';
            let classes = [cls];
            for (let key of ['selected', 'activated']) {
              if (result[key]) {
                classes.push(cls + '--' + key);
              }
              delete result[key];
            }
            for (let key of ['primaryText', 'secondText', 'showGraphic', 'showMeta']) {
              delete result[key];
            }
            result['class'] = processClasses(classes, result['class']);
            $$invalidate('attrs', attrs = result);
          }
    	};

    	return {
    		showGraphic,
    		primaryText,
    		secondText,
    		showMeta,
    		attrs,
    		$$props: $$props = exclude_internal_props($$props),
    		$$slots,
    		$$scope
    	};
    }

    class LinkListItem extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, ["showGraphic", "primaryText", "secondText", "showMeta", "attrs"]);
    	}
    }

    /* src\components\List\List.svelte generated by Svelte v3.6.1 */

    // (52:0) {:else}
    function create_else_block$1(ctx) {
    	var nav, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	var nav_levels = [
    		ctx.attrs
    	];

    	var nav_data = {};
    	for (var i = 0; i < nav_levels.length; i += 1) {
    		nav_data = assign(nav_data, nav_levels[i]);
    	}

    	return {
    		c() {
    			nav = element("nav");

    			if (default_slot) default_slot.c();

    			set_attributes(nav, nav_data);
    		},

    		l(nodes) {
    			if (default_slot) default_slot.l(nav_nodes);
    		},

    		m(target, anchor) {
    			insert(target, nav, anchor);

    			if (default_slot) {
    				default_slot.m(nav, null);
    			}

    			add_binding_callback(() => ctx.nav_binding(nav, null));
    			current = true;
    		},

    		p(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (changed.items) {
    				ctx.nav_binding(null, nav);
    				ctx.nav_binding(nav, null);
    			}

    			set_attributes(nav, get_spread_update(nav_levels, [
    				(changed.attrs) && ctx.attrs
    			]));
    		},

    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(nav);
    			}

    			if (default_slot) default_slot.d(detaching);
    			ctx.nav_binding(null, nav);
    		}
    	};
    }

    // (48:0) {#if as === 'ul'}
    function create_if_block$4(ctx) {
    	var ul, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	var ul_levels = [
    		ctx.attrs
    	];

    	var ul_data = {};
    	for (var i = 0; i < ul_levels.length; i += 1) {
    		ul_data = assign(ul_data, ul_levels[i]);
    	}

    	return {
    		c() {
    			ul = element("ul");

    			if (default_slot) default_slot.c();

    			set_attributes(ul, ul_data);
    		},

    		l(nodes) {
    			if (default_slot) default_slot.l(ul_nodes);
    		},

    		m(target, anchor) {
    			insert(target, ul, anchor);

    			if (default_slot) {
    				default_slot.m(ul, null);
    			}

    			add_binding_callback(() => ctx.ul_binding(ul, null));
    			current = true;
    		},

    		p(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (changed.items) {
    				ctx.ul_binding(null, ul);
    				ctx.ul_binding(ul, null);
    			}

    			set_attributes(ul, get_spread_update(ul_levels, [
    				(changed.attrs) && ctx.attrs
    			]));
    		},

    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(ul);
    			}

    			if (default_slot) default_slot.d(detaching);
    			ctx.ul_binding(null, ul);
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	var current_block_type_index, if_block, if_block_anchor, current;

    	var if_block_creators = [
    		create_if_block$4,
    		create_else_block$1
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.as === 'ul') return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},

    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},

    		p(changed, ctx) {
    			var previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);
    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();
    				transition_out(if_blocks[previous_block_index], 1, () => {
    					if_blocks[previous_block_index] = null;
    				});
    				check_outros();

    				if_block = if_blocks[current_block_type_index];
    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}
    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	
      // [svelte-upgrade warning]
      // this function needs to be manually rewritten
      let { slots = $$props.$$slots || {}, attrs = null, as = 'nav', self = null, ripple = false } = $$props;

      let mdcComponent, listItemRipples;
      onMount(() => {
        $$invalidate('mdcComponent', mdcComponent = new MDCList(self));
      });

      onDestroy(() => {
        mdcComponent.destroy();
        listItemRipples && listItemRipples.forEach(el => el.destroy());
      });

    	let { $$slots = {}, $$scope } = $$props;

    	function ul_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	function nav_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate('$$props', $$props = assign(assign({}, $$props), $$new_props));
    		if ('slots' in $$new_props) $$invalidate('slots', slots = $$new_props.slots);
    		if ('attrs' in $$new_props) $$invalidate('attrs', attrs = $$new_props.attrs);
    		if ('as' in $$new_props) $$invalidate('as', as = $$new_props.as);
    		if ('self' in $$new_props) $$invalidate('self', self = $$new_props.self);
    		if ('ripple' in $$new_props) $$invalidate('ripple', ripple = $$new_props.ripple);
    		if ('$$scope' in $$new_props) $$invalidate('$$scope', $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { ripple: 1, mdcComponent: 1, listItemRipples: 1, $$props: 1 }) => {
    		if ($$dirty.ripple || $$dirty.mdcComponent || $$dirty.listItemRipples) { {
            if (ripple && mdcComponent && !listItemRipples) {
              $$invalidate('listItemRipples', listItemRipples = mdcComponent.listElements.map((el) => new MDCRipple(el)));
            } else if (!ripple && mdcComponent && listItemRipples) {
              listItemRipples.forEach(el => el.destroy());
              $$invalidate('listItemRipples', listItemRipples = null);
            }
          } }
    		{
            let result = Object.assign({}, $$props);
            let cls = 'mdc-list';
            let classes = [cls];
            for (let key of ['two-line', 'dense', 'non-interactive', 'avatar-list']) {
              if (result[key]) {
                classes.push(cls + '--' + key);
              }
              delete result[key];
            }
            result['class'] = processClasses(classes, result['class']);
            $$invalidate('attrs', attrs = result);
          }
    	};

    	return {
    		slots,
    		attrs,
    		as,
    		self,
    		ripple,
    		ul_binding,
    		nav_binding,
    		$$props: $$props = exclude_internal_props($$props),
    		$$slots,
    		$$scope
    	};
    }

    class List extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, ["slots", "attrs", "as", "self", "ripple"]);
    	}
    }

    /* src\frames\Drawer.svelte generated by Svelte v3.6.1 */

    // (37:8) <i class="material-icons" slot="graphic">
    function create_graphic_slot_2(ctx) {
    	var i;

    	return {
    		c() {
    			i = element("i");
    			i.textContent = "inbox";
    			attr(i, "class", "material-icons");
    			attr(i, "slot", "graphic");
    		},

    		m(target, anchor) {
    			insert(target, i, anchor);
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(i);
    			}
    		}
    	};
    }

    // (36:6) <LinkListItem primaryText="Inbox" showGraphic activated>
    function create_default_slot_7(ctx) {
    	return {
    		c: noop,
    		m: noop,
    		p: noop,
    		d: noop
    	};
    }

    // (40:8) <i class="material-icons" slot="graphic">
    function create_graphic_slot_1(ctx) {
    	var i;

    	return {
    		c() {
    			i = element("i");
    			i.textContent = "send";
    			attr(i, "class", "material-icons");
    			attr(i, "slot", "graphic");
    		},

    		m(target, anchor) {
    			insert(target, i, anchor);
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(i);
    			}
    		}
    	};
    }

    // (39:6) <LinkListItem primaryText="Outgoing" showGraphic >
    function create_default_slot_6(ctx) {
    	return {
    		c: noop,
    		m: noop,
    		p: noop,
    		d: noop
    	};
    }

    // (43:8) <i class="material-icons" slot="graphic">
    function create_graphic_slot(ctx) {
    	var i;

    	return {
    		c() {
    			i = element("i");
    			i.textContent = "drafts";
    			attr(i, "class", "material-icons");
    			attr(i, "slot", "graphic");
    		},

    		m(target, anchor) {
    			insert(target, i, anchor);
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(i);
    			}
    		}
    	};
    }

    // (42:6) <LinkListItem primaryText="Drafts" showGraphic >
    function create_default_slot_5(ctx) {
    	return {
    		c: noop,
    		m: noop,
    		p: noop,
    		d: noop
    	};
    }

    // (35:4) <List ripple>
    function create_default_slot_4(ctx) {
    	var t0, t1, current;

    	var linklistitem0 = new LinkListItem({
    		props: {
    		primaryText: "Inbox",
    		showGraphic: true,
    		activated: true,
    		$$slots: {
    		default: [create_default_slot_7],
    		graphic: [create_graphic_slot_2]
    	},
    		$$scope: { ctx }
    	}
    	});

    	var linklistitem1 = new LinkListItem({
    		props: {
    		primaryText: "Outgoing",
    		showGraphic: true,
    		$$slots: {
    		default: [create_default_slot_6],
    		graphic: [create_graphic_slot_1]
    	},
    		$$scope: { ctx }
    	}
    	});

    	var linklistitem2 = new LinkListItem({
    		props: {
    		primaryText: "Drafts",
    		showGraphic: true,
    		$$slots: {
    		default: [create_default_slot_5],
    		graphic: [create_graphic_slot]
    	},
    		$$scope: { ctx }
    	}
    	});

    	return {
    		c() {
    			linklistitem0.$$.fragment.c();
    			t0 = space();
    			linklistitem1.$$.fragment.c();
    			t1 = space();
    			linklistitem2.$$.fragment.c();
    		},

    		m(target, anchor) {
    			mount_component(linklistitem0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(linklistitem1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(linklistitem2, target, anchor);
    			current = true;
    		},

    		p(changed, ctx) {
    			var linklistitem0_changes = {};
    			if (changed.$$scope) linklistitem0_changes.$$scope = { changed, ctx };
    			linklistitem0.$set(linklistitem0_changes);

    			var linklistitem1_changes = {};
    			if (changed.$$scope) linklistitem1_changes.$$scope = { changed, ctx };
    			linklistitem1.$set(linklistitem1_changes);

    			var linklistitem2_changes = {};
    			if (changed.$$scope) linklistitem2_changes.$$scope = { changed, ctx };
    			linklistitem2.$set(linklistitem2_changes);
    		},

    		i(local) {
    			if (current) return;
    			transition_in(linklistitem0.$$.fragment, local);

    			transition_in(linklistitem1.$$.fragment, local);

    			transition_in(linklistitem2.$$.fragment, local);

    			current = true;
    		},

    		o(local) {
    			transition_out(linklistitem0.$$.fragment, local);
    			transition_out(linklistitem1.$$.fragment, local);
    			transition_out(linklistitem2.$$.fragment, local);
    			current = false;
    		},

    		d(detaching) {
    			destroy_component(linklistitem0, detaching);

    			if (detaching) {
    				detach(t0);
    			}

    			destroy_component(linklistitem1, detaching);

    			if (detaching) {
    				detach(t1);
    			}

    			destroy_component(linklistitem2, detaching);
    		}
    	};
    }

    // (34:2) <DrawerContent>
    function create_default_slot_3(ctx) {
    	var current;

    	var list = new List({
    		props: {
    		ripple: true,
    		$$slots: { default: [create_default_slot_4] },
    		$$scope: { ctx }
    	}
    	});

    	return {
    		c() {
    			list.$$.fragment.c();
    		},

    		m(target, anchor) {
    			mount_component(list, target, anchor);
    			current = true;
    		},

    		p(changed, ctx) {
    			var list_changes = {};
    			if (changed.$$scope) list_changes.$$scope = { changed, ctx };
    			list.$set(list_changes);
    		},

    		i(local) {
    			if (current) return;
    			transition_in(list.$$.fragment, local);

    			current = true;
    		},

    		o(local) {
    			transition_out(list.$$.fragment, local);
    			current = false;
    		},

    		d(detaching) {
    			destroy_component(list, detaching);
    		}
    	};
    }

    // (32:0) <Drawer bind:this="{drawer}" {...attrs}>
    function create_default_slot_2(ctx) {
    	var t, current;

    	var drawerheader = new DrawerHeader({
    		props: {
    		title: "Mail",
    		subtitle: "email@material.io"
    	}
    	});

    	var drawercontent = new DrawerContent({
    		props: {
    		$$slots: { default: [create_default_slot_3] },
    		$$scope: { ctx }
    	}
    	});

    	return {
    		c() {
    			drawerheader.$$.fragment.c();
    			t = space();
    			drawercontent.$$.fragment.c();
    		},

    		m(target, anchor) {
    			mount_component(drawerheader, target, anchor);
    			insert(target, t, anchor);
    			mount_component(drawercontent, target, anchor);
    			current = true;
    		},

    		p(changed, ctx) {
    			var drawercontent_changes = {};
    			if (changed.$$scope) drawercontent_changes.$$scope = { changed, ctx };
    			drawercontent.$set(drawercontent_changes);
    		},

    		i(local) {
    			if (current) return;
    			transition_in(drawerheader.$$.fragment, local);

    			transition_in(drawercontent.$$.fragment, local);

    			current = true;
    		},

    		o(local) {
    			transition_out(drawerheader.$$.fragment, local);
    			transition_out(drawercontent.$$.fragment, local);
    			current = false;
    		},

    		d(detaching) {
    			destroy_component(drawerheader, detaching);

    			if (detaching) {
    				detach(t);
    			}

    			destroy_component(drawercontent, detaching);
    		}
    	};
    }

    // (53:2) {:else}
    function create_else_block$2(ctx) {
    	var current;

    	let topappbar_props = { title: "Permanent Drawer" };
    	var topappbar = new TopAppBar({ props: topappbar_props });

    	add_binding_callback(() => ctx.topappbar_binding_1(topappbar));

    	return {
    		c() {
    			topappbar.$$.fragment.c();
    		},

    		m(target, anchor) {
    			mount_component(topappbar, target, anchor);
    			current = true;
    		},

    		p(changed, ctx) {
    			var topappbar_changes = {};
    			topappbar.$set(topappbar_changes);
    		},

    		i(local) {
    			if (current) return;
    			transition_in(topappbar.$$.fragment, local);

    			current = true;
    		},

    		o(local) {
    			transition_out(topappbar.$$.fragment, local);
    			current = false;
    		},

    		d(detaching) {
    			ctx.topappbar_binding_1(null);

    			destroy_component(topappbar, detaching);
    		}
    	};
    }

    // (49:2) {#if dismissible || modal}
    function create_if_block$5(ctx) {
    	var current;

    	let topappbar_props = {
    		title: "Modal Drawer",
    		$$slots: {
    		default: [create_default_slot_1],
    		navigation: [create_navigation_slot]
    	},
    		$$scope: { ctx }
    	};
    	var topappbar = new TopAppBar({ props: topappbar_props });

    	add_binding_callback(() => ctx.topappbar_binding(topappbar));
    	topappbar.$on("nav", ctx.onNav);

    	return {
    		c() {
    			topappbar.$$.fragment.c();
    		},

    		m(target, anchor) {
    			mount_component(topappbar, target, anchor);
    			current = true;
    		},

    		p(changed, ctx) {
    			var topappbar_changes = {};
    			if (changed.$$scope) topappbar_changes.$$scope = { changed, ctx };
    			topappbar.$set(topappbar_changes);
    		},

    		i(local) {
    			if (current) return;
    			transition_in(topappbar.$$.fragment, local);

    			current = true;
    		},

    		o(local) {
    			transition_out(topappbar.$$.fragment, local);
    			current = false;
    		},

    		d(detaching) {
    			ctx.topappbar_binding(null);

    			destroy_component(topappbar, detaching);
    		}
    	};
    }

    // (51:4) <a href="#!" slot="navigation" class="material-icons">
    function create_navigation_slot(ctx) {
    	var a;

    	return {
    		c() {
    			a = element("a");
    			a.textContent = "menu";
    			attr(a, "href", "#!");
    			attr(a, "slot", "navigation");
    			attr(a, "class", "material-icons");
    		},

    		m(target, anchor) {
    			insert(target, a, anchor);
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(a);
    			}
    		}
    	};
    }

    // (50:2) <TopAppBar bind:this="{topAppBar}" on:nav="{onNav}" title="Modal Drawer" >
    function create_default_slot_1(ctx) {
    	return {
    		c: noop,
    		m: noop,
    		p: noop,
    		d: noop
    	};
    }

    // (48:0) <DrawerAppContent>
    function create_default_slot(ctx) {
    	var current_block_type_index, if_block, t0, div, t1, p0, t3, p1, t5, p2, t7, p3, current;

    	var if_block_creators = [
    		create_if_block$5,
    		create_else_block$2
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.dismissible || ctx.modal) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	var topappbarfixedadjust = new TopAppBarFixedAdjust({});

    	return {
    		c() {
    			if_block.c();
    			t0 = space();
    			div = element("div");
    			topappbarfixedadjust.$$.fragment.c();
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Lorem ipsum dolor sit amet, consectetur adipiscing elit,\r\n      sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut\r\n      enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut\r\n      aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in\r\n      voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint\r\n      occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit\r\n      anim id est laborum.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "Lorem ipsum dolor sit amet, consectetur adipiscing elit,\r\n      sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut\r\n      enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut\r\n      aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in\r\n      voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint\r\n      occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit\r\n      anim id est laborum.";
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "Lorem ipsum dolor sit amet, consectetur adipiscing elit,\r\n      sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut\r\n      enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut\r\n      aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in\r\n      voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint\r\n      occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit\r\n      anim id est laborum.";
    			t7 = space();
    			p3 = element("p");
    			p3.textContent = "Lorem ipsum dolor sit amet, consectetur adipiscing elit,\r\n      sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut\r\n      enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut\r\n      aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in\r\n      voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint\r\n      occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit\r\n      anim id est laborum.";
    			attr(div, "class", "drawer-main-content");
    		},

    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, div, anchor);
    			mount_component(topappbarfixedadjust, div, null);
    			append(div, t1);
    			append(div, p0);
    			append(div, t3);
    			append(div, p1);
    			append(div, t5);
    			append(div, p2);
    			append(div, t7);
    			append(div, p3);
    			current = true;
    		},

    		p(changed, ctx) {
    			var previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);
    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();
    				transition_out(if_blocks[previous_block_index], 1, () => {
    					if_blocks[previous_block_index] = null;
    				});
    				check_outros();

    				if_block = if_blocks[current_block_type_index];
    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}
    				transition_in(if_block, 1);
    				if_block.m(t0.parentNode, t0);
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(if_block);

    			transition_in(topappbarfixedadjust.$$.fragment, local);

    			current = true;
    		},

    		o(local) {
    			transition_out(if_block);
    			transition_out(topappbarfixedadjust.$$.fragment, local);
    			current = false;
    		},

    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);

    			if (detaching) {
    				detach(t0);
    				detach(div);
    			}

    			destroy_component(topappbarfixedadjust, );
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	var t, current;

    	var drawer_1_spread_levels = [
    		ctx.attrs
    	];

    	let drawer_1_props = {
    		$$slots: { default: [create_default_slot_2] },
    		$$scope: { ctx }
    	};
    	for (var i = 0; i < drawer_1_spread_levels.length; i += 1) {
    		drawer_1_props = assign(drawer_1_props, drawer_1_spread_levels[i]);
    	}
    	var drawer_1 = new Drawer({ props: drawer_1_props });

    	add_binding_callback(() => ctx.drawer_1_binding(drawer_1));

    	var drawerappcontent = new DrawerAppContent({
    		props: {
    		$$slots: { default: [create_default_slot] },
    		$$scope: { ctx }
    	}
    	});

    	return {
    		c() {
    			drawer_1.$$.fragment.c();
    			t = space();
    			drawerappcontent.$$.fragment.c();
    		},

    		m(target, anchor) {
    			mount_component(drawer_1, target, anchor);
    			insert(target, t, anchor);
    			mount_component(drawerappcontent, target, anchor);
    			current = true;
    		},

    		p(changed, ctx) {
    			var drawer_1_changes = changed.attrs ? get_spread_update(drawer_1_spread_levels, [
    				ctx.attrs
    			]) : {};
    			if (changed.$$scope) drawer_1_changes.$$scope = { changed, ctx };
    			drawer_1.$set(drawer_1_changes);

    			var drawerappcontent_changes = {};
    			if (changed.$$scope || changed.dismissible || changed.modal || changed.topAppBar) drawerappcontent_changes.$$scope = { changed, ctx };
    			drawerappcontent.$set(drawerappcontent_changes);
    		},

    		i(local) {
    			if (current) return;
    			transition_in(drawer_1.$$.fragment, local);

    			transition_in(drawerappcontent.$$.fragment, local);

    			current = true;
    		},

    		o(local) {
    			transition_out(drawer_1.$$.fragment, local);
    			transition_out(drawerappcontent.$$.fragment, local);
    			current = false;
    		},

    		d(detaching) {
    			ctx.drawer_1_binding(null);

    			destroy_component(drawer_1, detaching);

    			if (detaching) {
    				detach(t);
    			}

    			destroy_component(drawerappcontent, detaching);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	

      let { name = "", drawer = null, topAppBar = null, dismissible = false, modal = false } = $$props;

      let attrs = null;
      if (window.location.search.indexOf('modal') > -1) {
        $$invalidate('modal', modal = true);
        $$invalidate('attrs', attrs = { modal });
      }
      if (window.location.search.indexOf('dismissible') > -1) {
        $$invalidate('dismissible', dismissible = true);
        $$invalidate('attrs', attrs = { dismissible });
      }

      function onNav(e) {
        console.log('e', e);
        if (dismissible) {
          drawer.toggle();
        } else if (modal) {
          drawer.toggle(true);
        }
      }

    	function drawer_1_binding($$component) {
    		drawer = $$component;
    		$$invalidate('drawer', drawer);
    	}

    	function topappbar_binding($$component) {
    		topAppBar = $$component;
    		$$invalidate('topAppBar', topAppBar);
    	}

    	function topappbar_binding_1($$component) {
    		topAppBar = $$component;
    		$$invalidate('topAppBar', topAppBar);
    	}

    	$$self.$set = $$props => {
    		if ('name' in $$props) $$invalidate('name', name = $$props.name);
    		if ('drawer' in $$props) $$invalidate('drawer', drawer = $$props.drawer);
    		if ('topAppBar' in $$props) $$invalidate('topAppBar', topAppBar = $$props.topAppBar);
    		if ('dismissible' in $$props) $$invalidate('dismissible', dismissible = $$props.dismissible);
    		if ('modal' in $$props) $$invalidate('modal', modal = $$props.modal);
    	};

    	return {
    		name,
    		drawer,
    		topAppBar,
    		dismissible,
    		modal,
    		attrs,
    		onNav,
    		drawer_1_binding,
    		topappbar_binding,
    		topappbar_binding_1
    	};
    }

    class Drawer_1 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, ["name", "drawer", "topAppBar", "dismissible", "modal"]);
    	}
    }

    const drawer = new Drawer_1({
      target: document.querySelector('#app-root'),
      props: {
        name: 'Svelte Material Design Components'
      }
    });

    window.drawer = drawer;

    return drawer;

}());
//# sourceMappingURL=drawer.js.map

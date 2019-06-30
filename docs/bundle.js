var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
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
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
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
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
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
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
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
    function beforeUpdate(fn) {
        get_current_component().$$.before_render.push(fn);
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
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
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

    const globals = (typeof window !== 'undefined' ? window : global);

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
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

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

    function __values(o) {
        var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
        if (m) return m.call(o);
        return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
    }

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
            if (matches(el, selector)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }
    function matches(element, selector) {
        var nativeMatches = element.matches
            || element.webkitMatchesSelector
            || element.msMatchesSelector;
        return nativeMatches.call(element, selector);
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
    var cssClasses = {
        // Ripple is a special case where the "root" component is really a "mixin" of sorts,
        // given that it's an 'upgrade' to an existing component. That being said it is the root
        // CSS class that all other CSS classes derive from.
        BG_FOCUSED: 'mdc-ripple-upgraded--background-focused',
        FG_ACTIVATION: 'mdc-ripple-upgraded--foreground-activation',
        FG_DEACTIVATION: 'mdc-ripple-upgraded--foreground-deactivation',
        ROOT: 'mdc-ripple-upgraded',
        UNBOUNDED: 'mdc-ripple-upgraded--unbounded',
    };
    var strings = {
        VAR_FG_SCALE: '--mdc-ripple-fg-scale',
        VAR_FG_SIZE: '--mdc-ripple-fg-size',
        VAR_FG_TRANSLATE_END: '--mdc-ripple-fg-translate-end',
        VAR_FG_TRANSLATE_START: '--mdc-ripple-fg-translate-start',
        VAR_LEFT: '--mdc-ripple-left',
        VAR_TOP: '--mdc-ripple-top',
    };
    var numbers = {
        DEACTIVATION_TIMEOUT_MS: 225,
        FG_DEACTIVATION_MS: 150,
        INITIAL_ORIGIN_SCALE: 0.6,
        PADDING: 10,
        TAP_DELAY_MS: 300,
    };

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
                return cssClasses;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCRippleFoundation, "strings", {
            get: function () {
                return strings;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCRippleFoundation, "numbers", {
            get: function () {
                return numbers;
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
                }, numbers.FG_DEACTIVATION_MS);
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
                isSurfaceActive: function () { return matches(instance.root_, ':active'); },
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

    const regex = /%s/gi;
    function buildClasses(classes, classList = []) {
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
    function debounce(fn, debounceDuration) {
        debounceDuration = debounceDuration || 100;
        return function () {
            if (!fn.debouncing) {
                var args = Array.prototype.slice.apply(arguments);
                fn.lastReturnVal = fn.apply(window, args);
                fn.debouncing = true;
            }
            clearTimeout(fn.debounceTimeout);
            fn.debounceTimeout = setTimeout(function () {
                fn.debouncing = false;
            }, debounceDuration);
            return fn.lastReturnVal;
        };
    }

    /* src\components\Button\Button.svelte generated by Svelte v3.6.1 */

    const file = "src\\components\\Button\\Button.svelte";

    // (50:0) {:else}
    function create_else_block(ctx) {
    	var button, t, button_class_value, current, dispose;

    	var if_block = (ctx.icon) && create_if_block_2(ctx);

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			button = element("button");
    			if (if_block) if_block.c();
    			t = space();

    			if (default_slot) default_slot.c();

    			attr(button, "type", ctx.type);
    			attr(button, "name", ctx.name);
    			button.disabled = ctx.disabled;
    			attr(button, "class", button_class_value = "mdc-button " + ctx.classes);
    			add_location(button, file, 50, 2, 1240);
    			dispose = listen(button, "click", ctx.click_handler);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(button_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, button, anchor);
    			if (if_block) if_block.m(button, null);
    			append(button, t);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			add_binding_callback(() => ctx.button_binding(button, null));
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (ctx.icon) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					if_block.m(button, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (changed.items) {
    				ctx.button_binding(null, button);
    				ctx.button_binding(button, null);
    			}

    			if (!current || changed.type) {
    				attr(button, "type", ctx.type);
    			}

    			if (!current || changed.name) {
    				attr(button, "name", ctx.name);
    			}

    			if (!current || changed.disabled) {
    				button.disabled = ctx.disabled;
    			}

    			if ((!current || changed.classes) && button_class_value !== (button_class_value = "mdc-button " + ctx.classes)) {
    				attr(button, "class", button_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(button);
    			}

    			if (if_block) if_block.d();

    			if (default_slot) default_slot.d(detaching);
    			ctx.button_binding(null, button);
    			dispose();
    		}
    	};
    }

    // (43:0) {#if href}
    function create_if_block(ctx) {
    	var a, t, a_class_value, current;

    	var if_block = (ctx.icon) && create_if_block_1(ctx);

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			a = element("a");
    			if (if_block) if_block.c();
    			t = space();

    			if (default_slot) default_slot.c();

    			attr(a, "role", "button");
    			attr(a, "href", ctx.href);
    			attr(a, "name", ctx.name);
    			attr(a, "disabled", ctx.disabled);
    			attr(a, "class", a_class_value = "mdc-button " + ctx.classes);
    			add_location(a, file, 43, 2, 1042);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(a_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, a, anchor);
    			if (if_block) if_block.m(a, null);
    			append(a, t);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			add_binding_callback(() => ctx.a_binding(a, null));
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (ctx.icon) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(a, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (changed.items) {
    				ctx.a_binding(null, a);
    				ctx.a_binding(a, null);
    			}

    			if (!current || changed.href) {
    				attr(a, "href", ctx.href);
    			}

    			if (!current || changed.name) {
    				attr(a, "name", ctx.name);
    			}

    			if (!current || changed.disabled) {
    				attr(a, "disabled", ctx.disabled);
    			}

    			if ((!current || changed.classes) && a_class_value !== (a_class_value = "mdc-button " + ctx.classes)) {
    				attr(a, "class", a_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(a);
    			}

    			if (if_block) if_block.d();

    			if (default_slot) default_slot.d(detaching);
    			ctx.a_binding(null, a);
    		}
    	};
    }

    // (52:2) {#if icon}
    function create_if_block_2(ctx) {
    	var i, t;

    	return {
    		c: function create() {
    			i = element("i");
    			t = text(ctx.icon);
    			attr(i, "class", "material-icons mdc-button__icon");
    			add_location(i, file, 52, 4, 1346);
    		},

    		m: function mount(target, anchor) {
    			insert(target, i, anchor);
    			append(i, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.icon) {
    				set_data(t, ctx.icon);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(i);
    			}
    		}
    	};
    }

    // (45:2) {#if icon}
    function create_if_block_1(ctx) {
    	var i, t;

    	return {
    		c: function create() {
    			i = element("i");
    			t = text(ctx.icon);
    			attr(i, "class", "material-icons mdc-button__icon");
    			add_location(i, file, 45, 4, 1148);
    		},

    		m: function mount(target, anchor) {
    			insert(target, i, anchor);
    			append(i, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.icon) {
    				set_data(t, ctx.icon);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(i);
    			}
    		}
    	};
    }

    function create_fragment(ctx) {
    	var current_block_type_index, if_block, if_block_anchor, current;

    	var if_block_creators = [
    		create_if_block,
    		create_else_block
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.href) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
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

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	

      let { self = null, raised = false, unelevated = false, stroked = false, dense = false, compact = false, background = '', color = '', href = '', name = '', disabled = false, icon = '', type = '' } = $$props;

      let mdcRipple = null;
      let classes;

      onMount(() => {
        mdcRipple = MDCRipple.attachTo(self);
      });

      onDestroy(() => {
        if (mdcRipple) mdcRipple.destroy();
      });

    	const writable_props = ['self', 'raised', 'unelevated', 'stroked', 'dense', 'compact', 'background', 'color', 'href', 'name', 'disabled', 'icon', 'type'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Button> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	function a_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	function button_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	$$self.$set = $$props => {
    		if ('self' in $$props) $$invalidate('self', self = $$props.self);
    		if ('raised' in $$props) $$invalidate('raised', raised = $$props.raised);
    		if ('unelevated' in $$props) $$invalidate('unelevated', unelevated = $$props.unelevated);
    		if ('stroked' in $$props) $$invalidate('stroked', stroked = $$props.stroked);
    		if ('dense' in $$props) $$invalidate('dense', dense = $$props.dense);
    		if ('compact' in $$props) $$invalidate('compact', compact = $$props.compact);
    		if ('background' in $$props) $$invalidate('background', background = $$props.background);
    		if ('color' in $$props) $$invalidate('color', color = $$props.color);
    		if ('href' in $$props) $$invalidate('href', href = $$props.href);
    		if ('name' in $$props) $$invalidate('name', name = $$props.name);
    		if ('disabled' in $$props) $$invalidate('disabled', disabled = $$props.disabled);
    		if ('icon' in $$props) $$invalidate('icon', icon = $$props.icon);
    		if ('type' in $$props) $$invalidate('type', type = $$props.type);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { raised: 1, unelevated: 1, stroked: 1, dense: 1, compact: 1, background: 1, color: 1 }) => {
    		if ($$dirty.raised || $$dirty.unelevated || $$dirty.stroked || $$dirty.dense || $$dirty.compact || $$dirty.background || $$dirty.color) { $$invalidate('classes', classes = buildClasses({
              'mdc-button--raised': raised,
              'mdc-button--unelevated': unelevated,
              'mdc-button--stroked': stroked,
              'mdc-button--dense': dense,
              'mdc-button--compact': compact,
              ['mdc-theme--' + background + '-bg']: !!background,
              ['mdc-theme--' + color + '-bg']: !!color,
            })); }
    	};

    	return {
    		self,
    		raised,
    		unelevated,
    		stroked,
    		dense,
    		compact,
    		background,
    		color,
    		href,
    		name,
    		disabled,
    		icon,
    		type,
    		classes,
    		click_handler,
    		a_binding,
    		button_binding,
    		$$slots,
    		$$scope
    	};
    }

    class Button extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, ["self", "raised", "unelevated", "stroked", "dense", "compact", "background", "color", "href", "name", "disabled", "icon", "type"]);
    	}

    	get self() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set self(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get raised() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set raised(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get unelevated() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set unelevated(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stroked() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stroked(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dense() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dense(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get compact() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set compact(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get background() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set background(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get href() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set href(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get name() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get icon() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get type() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set type(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function mdcAfterUpdate(target, mdc, unbounded) {
        afterUpdate(() => {
            let { mdcRipple, ripple, prevRipple } = mdc;
            if (ripple != prevRipple) {
                if (ripple && !mdcRipple) {
                    mdc.mdcRipple = new MDCRipple(target);
                    if (unbounded)
                        mdc.mdcRipple.unbounded = true;
                }
                else if (!ripple && mdcRipple) {
                    mdcRipple.destroy();
                    mdc.mdcRipple = undefined;
                }
                mdc.prevRipple = ripple;
            }
        });
    }
    function mdcOnDestroy(mdc) {
        onDestroy(() => {
            let { mdcComponent, mdcRipple } = mdc;
            if (mdcRipple) {
                mdcRipple.destroy();
            }
            if (mdcComponent) {
                mdcComponent.destroy();
            }
        });
    }

    /* src\components\Fab\Fab.svelte generated by Svelte v3.6.1 */

    const file$1 = "src\\components\\Fab\\Fab.svelte";

    // (31:2) {#if label}
    function create_if_block$1(ctx) {
    	var span, t;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(ctx.label);
    			attr(span, "class", "mdc-fab__label");
    			add_location(span, file$1, 31, 2, 821);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.label) {
    				set_data(t, ctx.label);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	var button, span, t0, t1, dispose;

    	var if_block = (ctx.label) && create_if_block$1(ctx);

    	return {
    		c: function create() {
    			button = element("button");
    			span = element("span");
    			t0 = text(ctx.icon);
    			t1 = space();
    			if (if_block) if_block.c();
    			attr(span, "class", "material-icons mdc-fab__icon");
    			add_location(span, file$1, 29, 2, 748);
    			attr(button, "class", "mdc-fab");
    			toggle_class(button, "mdc-fab--mini", ctx.mini);
    			toggle_class(button, "mdc-fab--exited", ctx.exited);
    			toggle_class(button, "mdc-fab--extended", ctx.extended);
    			add_location(button, file$1, 23, 0, 550);

    			dispose = [
    				listen(button, "click", ctx.click_handler),
    				listen(button, "mouseup", ctx.mouseup_handler),
    				listen(button, "mousedown", ctx.mousedown_handler)
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, button, anchor);
    			append(button, span);
    			append(span, t0);
    			append(button, t1);
    			if (if_block) if_block.m(button, null);
    			add_binding_callback(() => ctx.button_binding(button, null));
    		},

    		p: function update(changed, ctx) {
    			if (changed.icon) {
    				set_data(t0, ctx.icon);
    			}

    			if (ctx.label) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(button, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (changed.items) {
    				ctx.button_binding(null, button);
    				ctx.button_binding(button, null);
    			}

    			if (changed.mini) {
    				toggle_class(button, "mdc-fab--mini", ctx.mini);
    			}

    			if (changed.exited) {
    				toggle_class(button, "mdc-fab--exited", ctx.exited);
    			}

    			if (changed.extended) {
    				toggle_class(button, "mdc-fab--extended", ctx.extended);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(button);
    			}

    			if (if_block) if_block.d();
    			ctx.button_binding(null, button);
    			run_all(dispose);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	

      let { self = null, ripple = false, icon = '', label = '', className = '', mini = false, exited = false, extended = false } = $$props;

      let mdcComponent, mdcRipple, prevRipple;
      let mdc = { mdcComponent, mdcRipple, ripple, prevRipple };
      onMount(() => {
        mdcAfterUpdate(self, mdc);
        mdcOnDestroy(mdc);
      });

    	const writable_props = ['self', 'ripple', 'icon', 'label', 'className', 'mini', 'exited', 'extended'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Fab> was created with unknown prop '${key}'`);
    	});

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	function mouseup_handler(event) {
    		bubble($$self, event);
    	}

    	function mousedown_handler(event) {
    		bubble($$self, event);
    	}

    	function button_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	$$self.$set = $$props => {
    		if ('self' in $$props) $$invalidate('self', self = $$props.self);
    		if ('ripple' in $$props) $$invalidate('ripple', ripple = $$props.ripple);
    		if ('icon' in $$props) $$invalidate('icon', icon = $$props.icon);
    		if ('label' in $$props) $$invalidate('label', label = $$props.label);
    		if ('className' in $$props) $$invalidate('className', className = $$props.className);
    		if ('mini' in $$props) $$invalidate('mini', mini = $$props.mini);
    		if ('exited' in $$props) $$invalidate('exited', exited = $$props.exited);
    		if ('extended' in $$props) $$invalidate('extended', extended = $$props.extended);
    	};

    	$$self.$$.update = ($$dirty = { ripple: 1 }) => {
    		if ($$dirty.ripple) { mdc.ripple = ripple; }
    	};

    	return {
    		self,
    		ripple,
    		icon,
    		label,
    		className,
    		mini,
    		exited,
    		extended,
    		click_handler,
    		mouseup_handler,
    		mousedown_handler,
    		button_binding
    	};
    }

    class Fab extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["self", "ripple", "icon", "label", "className", "mini", "exited", "extended"]);
    	}

    	get self() {
    		throw new Error("<Fab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set self(value) {
    		throw new Error("<Fab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get ripple() {
    		throw new Error("<Fab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set ripple(value) {
    		throw new Error("<Fab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get icon() {
    		throw new Error("<Fab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<Fab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<Fab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<Fab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get className() {
    		throw new Error("<Fab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set className(value) {
    		throw new Error("<Fab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get mini() {
    		throw new Error("<Fab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set mini(value) {
    		throw new Error("<Fab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get exited() {
    		throw new Error("<Fab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set exited(value) {
    		throw new Error("<Fab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get extended() {
    		throw new Error("<Fab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set extended(value) {
    		throw new Error("<Fab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Card\Card.svelte generated by Svelte v3.6.1 */

    const file$2 = "src\\components\\Card\\Card.svelte";

    const get_actions_slot_changes = ({}) => ({});
    const get_actions_slot_context = ({}) => ({});

    const get_supportingText_slot_changes = ({}) => ({});
    const get_supportingText_slot_context = ({}) => ({});

    const get_subtitle_slot_changes = ({}) => ({});
    const get_subtitle_slot_context = ({}) => ({});

    const get_title_slot_changes = ({}) => ({});
    const get_title_slot_context = ({}) => ({});

    const get_media_slot_changes = ({}) => ({});
    const get_media_slot_context = ({}) => ({});

    // (32:6) {#if slots['media']}
    function create_if_block_4(ctx) {
    	var section, current;

    	const media_slot_1 = ctx.$$slots.media;
    	const media_slot = create_slot(media_slot_1, ctx, get_media_slot_context);

    	return {
    		c: function create() {
    			section = element("section");

    			if (media_slot) media_slot.c();

    			attr(section, "class", "mdc-card__media");
    			add_location(section, file$2, 32, 6, 1001);
    		},

    		l: function claim(nodes) {
    			if (media_slot) media_slot.l(section_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, section, anchor);

    			if (media_slot) {
    				media_slot.m(section, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (media_slot && media_slot.p && changed.$$scope) {
    				media_slot.p(get_slot_changes(media_slot_1, ctx, changed, get_media_slot_changes), get_slot_context(media_slot_1, ctx, get_media_slot_context));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(media_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(media_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(section);
    			}

    			if (media_slot) media_slot.d(detaching);
    		}
    	};
    }

    // (37:6) {#if slots['title']}
    function create_if_block_3(ctx) {
    	var div, div_class_value, current;

    	const title_slot_1 = ctx.$$slots.title;
    	const title_slot = create_slot(title_slot_1, ctx, get_title_slot_context);

    	return {
    		c: function create() {
    			div = element("div");

    			if (title_slot) title_slot.c();

    			attr(div, "class", div_class_value = "mdc-card__title " + ctx.classesTitle + " svelte-u6nrb5");
    			add_location(div, file$2, 37, 6, 1127);
    		},

    		l: function claim(nodes) {
    			if (title_slot) title_slot.l(div_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (title_slot && title_slot.p && changed.$$scope) {
    				title_slot.p(get_slot_changes(title_slot_1, ctx, changed, get_title_slot_changes), get_slot_context(title_slot_1, ctx, get_title_slot_context));
    			}

    			if ((!current || changed.classesTitle) && div_class_value !== (div_class_value = "mdc-card__title " + ctx.classesTitle + " svelte-u6nrb5")) {
    				attr(div, "class", div_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(title_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(title_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (title_slot) title_slot.d(detaching);
    		}
    	};
    }

    // (42:6) {#if slots['subtitle']}
    function create_if_block_2$1(ctx) {
    	var div, current;

    	const subtitle_slot_1 = ctx.$$slots.subtitle;
    	const subtitle_slot = create_slot(subtitle_slot_1, ctx, get_subtitle_slot_context);

    	return {
    		c: function create() {
    			div = element("div");

    			if (subtitle_slot) subtitle_slot.c();

    			attr(div, "class", "mdc-card__subtitle");
    			add_location(div, file$2, 42, 6, 1263);
    		},

    		l: function claim(nodes) {
    			if (subtitle_slot) subtitle_slot.l(div_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);

    			if (subtitle_slot) {
    				subtitle_slot.m(div, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (subtitle_slot && subtitle_slot.p && changed.$$scope) {
    				subtitle_slot.p(get_slot_changes(subtitle_slot_1, ctx, changed, get_subtitle_slot_changes), get_slot_context(subtitle_slot_1, ctx, get_subtitle_slot_context));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(subtitle_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(subtitle_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (subtitle_slot) subtitle_slot.d(detaching);
    		}
    	};
    }

    // (50:2) {#if slots['supportingText']}
    function create_if_block_1$1(ctx) {
    	var section, current;

    	const supportingText_slot_1 = ctx.$$slots.supportingText;
    	const supportingText_slot = create_slot(supportingText_slot_1, ctx, get_supportingText_slot_context);

    	return {
    		c: function create() {
    			section = element("section");

    			if (supportingText_slot) supportingText_slot.c();

    			attr(section, "class", "card-section mdc-card__supporting-text svelte-u6nrb5");
    			add_location(section, file$2, 50, 2, 1413);
    		},

    		l: function claim(nodes) {
    			if (supportingText_slot) supportingText_slot.l(section_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, section, anchor);

    			if (supportingText_slot) {
    				supportingText_slot.m(section, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (supportingText_slot && supportingText_slot.p && changed.$$scope) {
    				supportingText_slot.p(get_slot_changes(supportingText_slot_1, ctx, changed, get_supportingText_slot_changes), get_slot_context(supportingText_slot_1, ctx, get_supportingText_slot_context));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(supportingText_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(supportingText_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(section);
    			}

    			if (supportingText_slot) supportingText_slot.d(detaching);
    		}
    	};
    }

    // (56:2) {#if slots['actions']}
    function create_if_block$2(ctx) {
    	var section, section_class_value, current;

    	const actions_slot_1 = ctx.$$slots.actions;
    	const actions_slot = create_slot(actions_slot_1, ctx, get_actions_slot_context);

    	return {
    		c: function create() {
    			section = element("section");

    			if (actions_slot) actions_slot.c();

    			attr(section, "class", section_class_value = "mdc-card__actions " + ctx.classesActions + " svelte-u6nrb5");
    			add_location(section, file$2, 56, 2, 1554);
    		},

    		l: function claim(nodes) {
    			if (actions_slot) actions_slot.l(section_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, section, anchor);

    			if (actions_slot) {
    				actions_slot.m(section, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (actions_slot && actions_slot.p && changed.$$scope) {
    				actions_slot.p(get_slot_changes(actions_slot_1, ctx, changed, get_actions_slot_changes), get_slot_context(actions_slot_1, ctx, get_actions_slot_context));
    			}

    			if ((!current || changed.classesActions) && section_class_value !== (section_class_value = "mdc-card__actions " + ctx.classesActions + " svelte-u6nrb5")) {
    				attr(section, "class", section_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(actions_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(actions_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(section);
    			}

    			if (actions_slot) actions_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	var div1, div0, section, t0, t1, t2, t3, current;

    	var if_block0 = (ctx.slots['media']) && create_if_block_4(ctx);

    	var if_block1 = (ctx.slots['title']) && create_if_block_3(ctx);

    	var if_block2 = (ctx.slots['subtitle']) && create_if_block_2$1(ctx);

    	var if_block3 = (ctx.slots['supportingText']) && create_if_block_1$1(ctx);

    	var if_block4 = (ctx.slots['actions']) && create_if_block$2(ctx);

    	return {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			section = element("section");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			if (if_block3) if_block3.c();
    			t3 = space();
    			if (if_block4) if_block4.c();
    			attr(section, "class", "mdc-card__primary-action card-section svelte-u6nrb5");
    			add_location(section, file$2, 30, 4, 893);
    			attr(div0, "class", "" + ctx.isHorizontal + " svelte-u6nrb5");
    			add_location(div0, file$2, 29, 2, 860);
    			attr(div1, "class", "mdc-card");
    			add_location(div1, file$2, 28, 0, 835);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, section);
    			if (if_block0) if_block0.m(section, null);
    			append(section, t0);
    			if (if_block1) if_block1.m(section, null);
    			append(section, t1);
    			if (if_block2) if_block2.m(section, null);
    			add_binding_callback(() => ctx.section_binding(section, null));
    			append(div1, t2);
    			if (if_block3) if_block3.m(div1, null);
    			append(div1, t3);
    			if (if_block4) if_block4.m(div1, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (ctx.slots['media']) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_4(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(section, t0);
    				}
    			} else if (if_block0) {
    				group_outros();
    				transition_out(if_block0, 1, () => {
    					if_block0 = null;
    				});
    				check_outros();
    			}

    			if (ctx.slots['title']) {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(section, t1);
    				}
    			} else if (if_block1) {
    				group_outros();
    				transition_out(if_block1, 1, () => {
    					if_block1 = null;
    				});
    				check_outros();
    			}

    			if (ctx.slots['subtitle']) {
    				if (if_block2) {
    					if_block2.p(changed, ctx);
    					transition_in(if_block2, 1);
    				} else {
    					if_block2 = create_if_block_2$1(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(section, null);
    				}
    			} else if (if_block2) {
    				group_outros();
    				transition_out(if_block2, 1, () => {
    					if_block2 = null;
    				});
    				check_outros();
    			}

    			if (changed.items) {
    				ctx.section_binding(null, section);
    				ctx.section_binding(section, null);
    			}

    			if (!current || changed.isHorizontal) {
    				attr(div0, "class", "" + ctx.isHorizontal + " svelte-u6nrb5");
    			}

    			if (ctx.slots['supportingText']) {
    				if (if_block3) {
    					if_block3.p(changed, ctx);
    					transition_in(if_block3, 1);
    				} else {
    					if_block3 = create_if_block_1$1(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div1, t3);
    				}
    			} else if (if_block3) {
    				group_outros();
    				transition_out(if_block3, 1, () => {
    					if_block3 = null;
    				});
    				check_outros();
    			}

    			if (ctx.slots['actions']) {
    				if (if_block4) {
    					if_block4.p(changed, ctx);
    					transition_in(if_block4, 1);
    				} else {
    					if_block4 = create_if_block$2(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(div1, null);
    				}
    			} else if (if_block4) {
    				group_outros();
    				transition_out(if_block4, 1, () => {
    					if_block4 = null;
    				});
    				check_outros();
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div1);
    			}

    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			ctx.section_binding(null, section);
    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	

      let { self = null, ripple = false, horizontal = '', verticalActions = '', largeTitle = 'yes', classList = [], slots = $$props.$$slots || {}, isHorizontal } = $$props;
      let { classesActions } = $$props;
      let { classesTitle } = $$props;

      let mdcComponent, mdcRipple, prevRipple;
      let mdc = { mdcComponent, mdcRipple, ripple, prevRipple };
      onMount(() => {
        mdcAfterUpdate(self, mdc);
        mdcOnDestroy(mdc);
      });

    	let { $$slots = {}, $$scope } = $$props;

    	function section_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate('$$props', $$props = assign(assign({}, $$props), $$new_props));
    		if ('self' in $$new_props) $$invalidate('self', self = $$new_props.self);
    		if ('ripple' in $$new_props) $$invalidate('ripple', ripple = $$new_props.ripple);
    		if ('horizontal' in $$new_props) $$invalidate('horizontal', horizontal = $$new_props.horizontal);
    		if ('verticalActions' in $$new_props) $$invalidate('verticalActions', verticalActions = $$new_props.verticalActions);
    		if ('largeTitle' in $$new_props) $$invalidate('largeTitle', largeTitle = $$new_props.largeTitle);
    		if ('classList' in $$new_props) $$invalidate('classList', classList = $$new_props.classList);
    		if ('slots' in $$new_props) $$invalidate('slots', slots = $$new_props.slots);
    		if ('isHorizontal' in $$new_props) $$invalidate('isHorizontal', isHorizontal = $$new_props.isHorizontal);
    		if ('classesActions' in $$new_props) $$invalidate('classesActions', classesActions = $$new_props.classesActions);
    		if ('classesTitle' in $$new_props) $$invalidate('classesTitle', classesTitle = $$new_props.classesTitle);
    		if ('$$scope' in $$new_props) $$invalidate('$$scope', $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { horizontal: 1, verticalActions: 1, largeTitle: 1, ripple: 1 }) => {
    		if ($$dirty.horizontal) { $$invalidate('isHorizontal', isHorizontal = horizontal && 'mdc-card__horizontal-block'); }
    		if ($$dirty.verticalActions) { $$invalidate('classesActions', classesActions = verticalActions && 'mdc-card__actions--vertical'); }
    		if ($$dirty.largeTitle) { $$invalidate('classesTitle', classesTitle = largeTitle && 'mdc-card__title--large'); }
    		if ($$dirty.ripple) { mdc.ripple = ripple; }
    	};

    	return {
    		self,
    		ripple,
    		horizontal,
    		verticalActions,
    		largeTitle,
    		classList,
    		slots,
    		isHorizontal,
    		classesActions,
    		classesTitle,
    		section_binding,
    		$$props: $$props = exclude_internal_props($$props),
    		$$slots,
    		$$scope
    	};
    }

    class Card extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, ["self", "ripple", "horizontal", "verticalActions", "largeTitle", "classList", "slots", "isHorizontal", "classesActions", "classesTitle"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.isHorizontal === undefined && !('isHorizontal' in props)) {
    			console.warn("<Card> was created without expected prop 'isHorizontal'");
    		}
    		if (ctx.classesActions === undefined && !('classesActions' in props)) {
    			console.warn("<Card> was created without expected prop 'classesActions'");
    		}
    		if (ctx.classesTitle === undefined && !('classesTitle' in props)) {
    			console.warn("<Card> was created without expected prop 'classesTitle'");
    		}
    	}

    	get self() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set self(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get ripple() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set ripple(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get horizontal() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set horizontal(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get verticalActions() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set verticalActions(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get largeTitle() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set largeTitle(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classList() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classList(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get slots() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set slots(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isHorizontal() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isHorizontal(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classesActions() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classesActions(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classesTitle() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classesTitle(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
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
    var cssPropertyNameMap = {
        animation: {
            prefixed: '-webkit-animation',
            standard: 'animation',
        },
        transform: {
            prefixed: '-webkit-transform',
            standard: 'transform',
        },
        transition: {
            prefixed: '-webkit-transition',
            standard: 'transition',
        },
    };
    var jsEventTypeMap = {
        animationend: {
            cssProperty: 'animation',
            prefixed: 'webkitAnimationEnd',
            standard: 'animationend',
        },
        animationiteration: {
            cssProperty: 'animation',
            prefixed: 'webkitAnimationIteration',
            standard: 'animationiteration',
        },
        animationstart: {
            cssProperty: 'animation',
            prefixed: 'webkitAnimationStart',
            standard: 'animationstart',
        },
        transitionend: {
            cssProperty: 'transition',
            prefixed: 'webkitTransitionEnd',
            standard: 'transitionend',
        },
    };
    function isWindow(windowObj) {
        return Boolean(windowObj.document) && typeof windowObj.document.createElement === 'function';
    }
    function getCorrectPropertyName(windowObj, cssProperty) {
        if (isWindow(windowObj) && cssProperty in cssPropertyNameMap) {
            var el = windowObj.document.createElement('div');
            var _a = cssPropertyNameMap[cssProperty], standard = _a.standard, prefixed = _a.prefixed;
            var isStandard = standard in el.style;
            return isStandard ? standard : prefixed;
        }
        return cssProperty;
    }
    function getCorrectEventName(windowObj, eventType) {
        if (isWindow(windowObj) && eventType in jsEventTypeMap) {
            var el = windowObj.document.createElement('div');
            var _a = jsEventTypeMap[eventType], standard = _a.standard, prefixed = _a.prefixed, cssProperty = _a.cssProperty;
            var isStandard = cssProperty in el.style;
            return isStandard ? standard : prefixed;
        }
        return eventType;
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
    var cssClasses$1 = {
        ANIM_CHECKED_INDETERMINATE: 'mdc-checkbox--anim-checked-indeterminate',
        ANIM_CHECKED_UNCHECKED: 'mdc-checkbox--anim-checked-unchecked',
        ANIM_INDETERMINATE_CHECKED: 'mdc-checkbox--anim-indeterminate-checked',
        ANIM_INDETERMINATE_UNCHECKED: 'mdc-checkbox--anim-indeterminate-unchecked',
        ANIM_UNCHECKED_CHECKED: 'mdc-checkbox--anim-unchecked-checked',
        ANIM_UNCHECKED_INDETERMINATE: 'mdc-checkbox--anim-unchecked-indeterminate',
        BACKGROUND: 'mdc-checkbox__background',
        CHECKED: 'mdc-checkbox--checked',
        CHECKMARK: 'mdc-checkbox__checkmark',
        CHECKMARK_PATH: 'mdc-checkbox__checkmark-path',
        DISABLED: 'mdc-checkbox--disabled',
        INDETERMINATE: 'mdc-checkbox--indeterminate',
        MIXEDMARK: 'mdc-checkbox__mixedmark',
        NATIVE_CONTROL: 'mdc-checkbox__native-control',
        ROOT: 'mdc-checkbox',
        SELECTED: 'mdc-checkbox--selected',
        UPGRADED: 'mdc-checkbox--upgraded',
    };
    var strings$1 = {
        ARIA_CHECKED_ATTR: 'aria-checked',
        ARIA_CHECKED_INDETERMINATE_VALUE: 'mixed',
        NATIVE_CONTROL_SELECTOR: '.mdc-checkbox__native-control',
        TRANSITION_STATE_CHECKED: 'checked',
        TRANSITION_STATE_INDETERMINATE: 'indeterminate',
        TRANSITION_STATE_INIT: 'init',
        TRANSITION_STATE_UNCHECKED: 'unchecked',
    };
    var numbers$1 = {
        ANIM_END_LATCH_MS: 250,
    };

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
    var MDCCheckboxFoundation = /** @class */ (function (_super) {
        __extends(MDCCheckboxFoundation, _super);
        function MDCCheckboxFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCCheckboxFoundation.defaultAdapter, adapter)) || this;
            _this.currentCheckState_ = strings$1.TRANSITION_STATE_INIT;
            _this.currentAnimationClass_ = '';
            _this.animEndLatchTimer_ = 0;
            _this.enableAnimationEndHandler_ = false;
            return _this;
        }
        Object.defineProperty(MDCCheckboxFoundation, "cssClasses", {
            get: function () {
                return cssClasses$1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckboxFoundation, "strings", {
            get: function () {
                return strings$1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckboxFoundation, "numbers", {
            get: function () {
                return numbers$1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckboxFoundation, "defaultAdapter", {
            get: function () {
                return {
                    addClass: function () { return undefined; },
                    forceLayout: function () { return undefined; },
                    hasNativeControl: function () { return false; },
                    isAttachedToDOM: function () { return false; },
                    isChecked: function () { return false; },
                    isIndeterminate: function () { return false; },
                    removeClass: function () { return undefined; },
                    removeNativeControlAttr: function () { return undefined; },
                    setNativeControlAttr: function () { return undefined; },
                    setNativeControlDisabled: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCCheckboxFoundation.prototype.init = function () {
            this.currentCheckState_ = this.determineCheckState_();
            this.updateAriaChecked_();
            this.adapter_.addClass(cssClasses$1.UPGRADED);
        };
        MDCCheckboxFoundation.prototype.destroy = function () {
            clearTimeout(this.animEndLatchTimer_);
        };
        MDCCheckboxFoundation.prototype.setDisabled = function (disabled) {
            this.adapter_.setNativeControlDisabled(disabled);
            if (disabled) {
                this.adapter_.addClass(cssClasses$1.DISABLED);
            }
            else {
                this.adapter_.removeClass(cssClasses$1.DISABLED);
            }
        };
        /**
         * Handles the animationend event for the checkbox
         */
        MDCCheckboxFoundation.prototype.handleAnimationEnd = function () {
            var _this = this;
            if (!this.enableAnimationEndHandler_) {
                return;
            }
            clearTimeout(this.animEndLatchTimer_);
            this.animEndLatchTimer_ = setTimeout(function () {
                _this.adapter_.removeClass(_this.currentAnimationClass_);
                _this.enableAnimationEndHandler_ = false;
            }, numbers$1.ANIM_END_LATCH_MS);
        };
        /**
         * Handles the change event for the checkbox
         */
        MDCCheckboxFoundation.prototype.handleChange = function () {
            this.transitionCheckState_();
        };
        MDCCheckboxFoundation.prototype.transitionCheckState_ = function () {
            if (!this.adapter_.hasNativeControl()) {
                return;
            }
            var oldState = this.currentCheckState_;
            var newState = this.determineCheckState_();
            if (oldState === newState) {
                return;
            }
            this.updateAriaChecked_();
            var TRANSITION_STATE_UNCHECKED = strings$1.TRANSITION_STATE_UNCHECKED;
            var SELECTED = cssClasses$1.SELECTED;
            if (newState === TRANSITION_STATE_UNCHECKED) {
                this.adapter_.removeClass(SELECTED);
            }
            else {
                this.adapter_.addClass(SELECTED);
            }
            // Check to ensure that there isn't a previously existing animation class, in case for example
            // the user interacted with the checkbox before the animation was finished.
            if (this.currentAnimationClass_.length > 0) {
                clearTimeout(this.animEndLatchTimer_);
                this.adapter_.forceLayout();
                this.adapter_.removeClass(this.currentAnimationClass_);
            }
            this.currentAnimationClass_ = this.getTransitionAnimationClass_(oldState, newState);
            this.currentCheckState_ = newState;
            // Check for parentNode so that animations are only run when the element is attached
            // to the DOM.
            if (this.adapter_.isAttachedToDOM() && this.currentAnimationClass_.length > 0) {
                this.adapter_.addClass(this.currentAnimationClass_);
                this.enableAnimationEndHandler_ = true;
            }
        };
        MDCCheckboxFoundation.prototype.determineCheckState_ = function () {
            var TRANSITION_STATE_INDETERMINATE = strings$1.TRANSITION_STATE_INDETERMINATE, TRANSITION_STATE_CHECKED = strings$1.TRANSITION_STATE_CHECKED, TRANSITION_STATE_UNCHECKED = strings$1.TRANSITION_STATE_UNCHECKED;
            if (this.adapter_.isIndeterminate()) {
                return TRANSITION_STATE_INDETERMINATE;
            }
            return this.adapter_.isChecked() ? TRANSITION_STATE_CHECKED : TRANSITION_STATE_UNCHECKED;
        };
        MDCCheckboxFoundation.prototype.getTransitionAnimationClass_ = function (oldState, newState) {
            var TRANSITION_STATE_INIT = strings$1.TRANSITION_STATE_INIT, TRANSITION_STATE_CHECKED = strings$1.TRANSITION_STATE_CHECKED, TRANSITION_STATE_UNCHECKED = strings$1.TRANSITION_STATE_UNCHECKED;
            var _a = MDCCheckboxFoundation.cssClasses, ANIM_UNCHECKED_CHECKED = _a.ANIM_UNCHECKED_CHECKED, ANIM_UNCHECKED_INDETERMINATE = _a.ANIM_UNCHECKED_INDETERMINATE, ANIM_CHECKED_UNCHECKED = _a.ANIM_CHECKED_UNCHECKED, ANIM_CHECKED_INDETERMINATE = _a.ANIM_CHECKED_INDETERMINATE, ANIM_INDETERMINATE_CHECKED = _a.ANIM_INDETERMINATE_CHECKED, ANIM_INDETERMINATE_UNCHECKED = _a.ANIM_INDETERMINATE_UNCHECKED;
            switch (oldState) {
                case TRANSITION_STATE_INIT:
                    if (newState === TRANSITION_STATE_UNCHECKED) {
                        return '';
                    }
                    return newState === TRANSITION_STATE_CHECKED ? ANIM_INDETERMINATE_CHECKED : ANIM_INDETERMINATE_UNCHECKED;
                case TRANSITION_STATE_UNCHECKED:
                    return newState === TRANSITION_STATE_CHECKED ? ANIM_UNCHECKED_CHECKED : ANIM_UNCHECKED_INDETERMINATE;
                case TRANSITION_STATE_CHECKED:
                    return newState === TRANSITION_STATE_UNCHECKED ? ANIM_CHECKED_UNCHECKED : ANIM_CHECKED_INDETERMINATE;
                default: // TRANSITION_STATE_INDETERMINATE
                    return newState === TRANSITION_STATE_CHECKED ? ANIM_INDETERMINATE_CHECKED : ANIM_INDETERMINATE_UNCHECKED;
            }
        };
        MDCCheckboxFoundation.prototype.updateAriaChecked_ = function () {
            // Ensure aria-checked is set to mixed if checkbox is in indeterminate state.
            if (this.adapter_.isIndeterminate()) {
                this.adapter_.setNativeControlAttr(strings$1.ARIA_CHECKED_ATTR, strings$1.ARIA_CHECKED_INDETERMINATE_VALUE);
            }
            else {
                // The on/off state does not need to keep track of aria-checked, since
                // the screenreader uses the checked property on the checkbox element.
                this.adapter_.removeNativeControlAttr(strings$1.ARIA_CHECKED_ATTR);
            }
        };
        return MDCCheckboxFoundation;
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
    var CB_PROTO_PROPS = ['checked', 'indeterminate'];
    var MDCCheckbox = /** @class */ (function (_super) {
        __extends(MDCCheckbox, _super);
        function MDCCheckbox() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ripple_ = _this.createRipple_();
            return _this;
        }
        MDCCheckbox.attachTo = function (root) {
            return new MDCCheckbox(root);
        };
        Object.defineProperty(MDCCheckbox.prototype, "ripple", {
            get: function () {
                return this.ripple_;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckbox.prototype, "checked", {
            get: function () {
                return this.nativeControl_.checked;
            },
            set: function (checked) {
                this.nativeControl_.checked = checked;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckbox.prototype, "indeterminate", {
            get: function () {
                return this.nativeControl_.indeterminate;
            },
            set: function (indeterminate) {
                this.nativeControl_.indeterminate = indeterminate;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckbox.prototype, "disabled", {
            get: function () {
                return this.nativeControl_.disabled;
            },
            set: function (disabled) {
                this.foundation_.setDisabled(disabled);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckbox.prototype, "value", {
            get: function () {
                return this.nativeControl_.value;
            },
            set: function (value) {
                this.nativeControl_.value = value;
            },
            enumerable: true,
            configurable: true
        });
        MDCCheckbox.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.handleChange_ = function () { return _this.foundation_.handleChange(); };
            this.handleAnimationEnd_ = function () { return _this.foundation_.handleAnimationEnd(); };
            this.nativeControl_.addEventListener('change', this.handleChange_);
            this.listen(getCorrectEventName(window, 'animationend'), this.handleAnimationEnd_);
            this.installPropertyChangeHooks_();
        };
        MDCCheckbox.prototype.destroy = function () {
            this.ripple_.destroy();
            this.nativeControl_.removeEventListener('change', this.handleChange_);
            this.unlisten(getCorrectEventName(window, 'animationend'), this.handleAnimationEnd_);
            this.uninstallPropertyChangeHooks_();
            _super.prototype.destroy.call(this);
        };
        MDCCheckbox.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                forceLayout: function () { return _this.root_.offsetWidth; },
                hasNativeControl: function () { return !!_this.nativeControl_; },
                isAttachedToDOM: function () { return Boolean(_this.root_.parentNode); },
                isChecked: function () { return _this.checked; },
                isIndeterminate: function () { return _this.indeterminate; },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                removeNativeControlAttr: function (attr) { return _this.nativeControl_.removeAttribute(attr); },
                setNativeControlAttr: function (attr, value) { return _this.nativeControl_.setAttribute(attr, value); },
                setNativeControlDisabled: function (disabled) { return _this.nativeControl_.disabled = disabled; },
            };
            return new MDCCheckboxFoundation(adapter);
        };
        MDCCheckbox.prototype.createRipple_ = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = __assign({}, MDCRipple.createAdapter(this), { deregisterInteractionHandler: function (evtType, handler) { return _this.nativeControl_.removeEventListener(evtType, handler); }, isSurfaceActive: function () { return matches(_this.nativeControl_, ':active'); }, isUnbounded: function () { return true; }, registerInteractionHandler: function (evtType, handler) { return _this.nativeControl_.addEventListener(evtType, handler); } });
            return new MDCRipple(this.root_, new MDCRippleFoundation(adapter));
        };
        MDCCheckbox.prototype.installPropertyChangeHooks_ = function () {
            var _this = this;
            var nativeCb = this.nativeControl_;
            var cbProto = Object.getPrototypeOf(nativeCb);
            CB_PROTO_PROPS.forEach(function (controlState) {
                var desc = Object.getOwnPropertyDescriptor(cbProto, controlState);
                // We have to check for this descriptor, since some browsers (Safari) don't support its return.
                // See: https://bugs.webkit.org/show_bug.cgi?id=49739
                if (!validDescriptor(desc)) {
                    return;
                }
                // Type cast is needed for compatibility with Closure Compiler.
                var nativeGetter = desc.get;
                var nativeCbDesc = {
                    configurable: desc.configurable,
                    enumerable: desc.enumerable,
                    get: nativeGetter,
                    set: function (state) {
                        desc.set.call(nativeCb, state);
                        _this.foundation_.handleChange();
                    },
                };
                Object.defineProperty(nativeCb, controlState, nativeCbDesc);
            });
        };
        MDCCheckbox.prototype.uninstallPropertyChangeHooks_ = function () {
            var nativeCb = this.nativeControl_;
            var cbProto = Object.getPrototypeOf(nativeCb);
            CB_PROTO_PROPS.forEach(function (controlState) {
                var desc = Object.getOwnPropertyDescriptor(cbProto, controlState);
                if (!validDescriptor(desc)) {
                    return;
                }
                Object.defineProperty(nativeCb, controlState, desc);
            });
        };
        Object.defineProperty(MDCCheckbox.prototype, "nativeControl_", {
            get: function () {
                var NATIVE_CONTROL_SELECTOR = MDCCheckboxFoundation.strings.NATIVE_CONTROL_SELECTOR;
                var el = this.root_.querySelector(NATIVE_CONTROL_SELECTOR);
                if (!el) {
                    throw new Error("Checkbox component requires a " + NATIVE_CONTROL_SELECTOR + " element");
                }
                return el;
            },
            enumerable: true,
            configurable: true
        });
        return MDCCheckbox;
    }(MDCComponent));
    function validDescriptor(inputPropDesc) {
        return !!inputPropDesc && typeof inputPropDesc.set === 'function';
    }

    /* src\components\Checkbox\Checkbox.svelte generated by Svelte v3.6.1 */

    const file$3 = "src\\components\\Checkbox\\Checkbox.svelte";

    function create_fragment$3(ctx) {
    	var div2, input, t0, div1, svg, path, t1, div0, dispose;

    	return {
    		c: function create() {
    			div2 = element("div");
    			input = element("input");
    			t0 = space();
    			div1 = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t1 = space();
    			div0 = element("div");
    			attr(input, "type", "checkbox");
    			attr(input, "class", "mdc-checkbox__native-control");
    			add_location(input, file$3, 19, 2, 416);
    			attr(path, "class", "mdc-checkbox__checkmark__path");
    			attr(path, "fill", "none");
    			attr(path, "stroke", "white");
    			attr(path, "d", "M1.73,12.91 8.1,19.28 22.79,4.59");
    			add_location(path, file$3, 22, 6, 613);
    			attr(svg, "class", "mdc-checkbox__checkmark");
    			attr(svg, "viewBox", "0 0 24 24");
    			add_location(svg, file$3, 21, 4, 549);
    			attr(div0, "class", "mdc-checkbox__mixedmark");
    			add_location(div0, file$3, 24, 4, 739);
    			attr(div1, "class", "mdc-checkbox__background");
    			add_location(div1, file$3, 20, 2, 506);
    			attr(div2, "class", "mdc-checkbox");
    			add_location(div2, file$3, 18, 0, 370);
    			dispose = listen(input, "change", ctx.input_change_handler);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, input);

    			input.checked = ctx.checked;

    			append(div2, t0);
    			append(div2, div1);
    			append(div1, svg);
    			append(svg, path);
    			append(div1, t1);
    			append(div1, div0);
    			add_binding_callback(() => ctx.div2_binding(div2, null));
    		},

    		p: function update(changed, ctx) {
    			if (changed.checked) input.checked = ctx.checked;
    			if (changed.items) {
    				ctx.div2_binding(null, div2);
    				ctx.div2_binding(div2, null);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div2);
    			}

    			ctx.div2_binding(null, div2);
    			dispose();
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	

      let { self = null, checked = false, indeterminate = false, mdcCheckbox = null } = $$props;

      onMount(() => {
        $$invalidate('mdcCheckbox', mdcCheckbox = MDCCheckbox.attachTo(self));
      });

      onDestroy(() => {
        mdcCheckbox.destroy();
      });

    	const writable_props = ['self', 'checked', 'indeterminate', 'mdcCheckbox'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Checkbox> was created with unknown prop '${key}'`);
    	});

    	function input_change_handler() {
    		checked = this.checked;
    		$$invalidate('checked', checked);
    	}

    	function div2_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	$$self.$set = $$props => {
    		if ('self' in $$props) $$invalidate('self', self = $$props.self);
    		if ('checked' in $$props) $$invalidate('checked', checked = $$props.checked);
    		if ('indeterminate' in $$props) $$invalidate('indeterminate', indeterminate = $$props.indeterminate);
    		if ('mdcCheckbox' in $$props) $$invalidate('mdcCheckbox', mdcCheckbox = $$props.mdcCheckbox);
    	};

    	return {
    		self,
    		checked,
    		indeterminate,
    		mdcCheckbox,
    		input_change_handler,
    		div2_binding
    	};
    }

    class Checkbox extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, ["self", "checked", "indeterminate", "mdcCheckbox"]);
    	}

    	get self() {
    		throw new Error("<Checkbox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set self(value) {
    		throw new Error("<Checkbox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get checked() {
    		throw new Error("<Checkbox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set checked(value) {
    		throw new Error("<Checkbox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get indeterminate() {
    		throw new Error("<Checkbox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set indeterminate(value) {
    		throw new Error("<Checkbox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get mdcCheckbox() {
    		throw new Error("<Checkbox>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set mdcCheckbox(value) {
    		throw new Error("<Checkbox>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
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

    var matches$1 = typeof Element === 'undefined'
      ? function () {}
      : Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;

    function tabbable(el, options) {
      options = options || {};

      var regularTabbables = [];
      var orderedTabbables = [];

      var candidates = el.querySelectorAll(candidateSelector);

      if (options.includeContainer) {
        if (matches$1.call(el, candidateSelector)) {
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
      if (matches$1.call(node, candidateSelector) === false) return false;
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
      if (matches$1.call(node, focusableCandidateSelector) === false) return false;
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
    function createFocusTrapInstance(surfaceEl, focusTrapFactory, initialFocusEl) {
        if (focusTrapFactory === void 0) { focusTrapFactory = focusTrap_1; }
        return focusTrapFactory(surfaceEl, {
            clickOutsideDeactivates: true,
            escapeDeactivates: false,
            initialFocus: initialFocusEl,
        });
    }
    function isScrollable(el) {
        return el ? el.scrollHeight > el.offsetHeight : false;
    }
    function areTopsMisaligned(els) {
        var tops = new Set();
        [].forEach.call(els, function (el) { return tops.add(el.offsetTop); });
        return tops.size > 1;
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
    var cssClasses$2 = {
        CLOSING: 'mdc-dialog--closing',
        OPEN: 'mdc-dialog--open',
        OPENING: 'mdc-dialog--opening',
        SCROLLABLE: 'mdc-dialog--scrollable',
        SCROLL_LOCK: 'mdc-dialog-scroll-lock',
        STACKED: 'mdc-dialog--stacked',
    };
    var strings$2 = {
        ACTION_ATTRIBUTE: 'data-mdc-dialog-action',
        BUTTON_SELECTOR: '.mdc-dialog__button',
        CLOSED_EVENT: 'MDCDialog:closed',
        CLOSE_ACTION: 'close',
        CLOSING_EVENT: 'MDCDialog:closing',
        CONTAINER_SELECTOR: '.mdc-dialog__container',
        CONTENT_SELECTOR: '.mdc-dialog__content',
        DEFAULT_BUTTON_SELECTOR: '.mdc-dialog__button--default',
        DESTROY_ACTION: 'destroy',
        OPENED_EVENT: 'MDCDialog:opened',
        OPENING_EVENT: 'MDCDialog:opening',
        SCRIM_SELECTOR: '.mdc-dialog__scrim',
        SUPPRESS_DEFAULT_PRESS_SELECTOR: [
            'textarea',
            '.mdc-menu .mdc-list-item',
        ].join(', '),
        SURFACE_SELECTOR: '.mdc-dialog__surface',
    };
    var numbers$2 = {
        DIALOG_ANIMATION_CLOSE_TIME_MS: 75,
        DIALOG_ANIMATION_OPEN_TIME_MS: 150,
    };

    /**
     * @license
     * Copyright 2017 Google Inc.
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
    var MDCDialogFoundation = /** @class */ (function (_super) {
        __extends(MDCDialogFoundation, _super);
        function MDCDialogFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCDialogFoundation.defaultAdapter, adapter)) || this;
            _this.isOpen_ = false;
            _this.animationFrame_ = 0;
            _this.animationTimer_ = 0;
            _this.layoutFrame_ = 0;
            _this.escapeKeyAction_ = strings$2.CLOSE_ACTION;
            _this.scrimClickAction_ = strings$2.CLOSE_ACTION;
            _this.autoStackButtons_ = true;
            _this.areButtonsStacked_ = false;
            return _this;
        }
        Object.defineProperty(MDCDialogFoundation, "cssClasses", {
            get: function () {
                return cssClasses$2;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCDialogFoundation, "strings", {
            get: function () {
                return strings$2;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCDialogFoundation, "numbers", {
            get: function () {
                return numbers$2;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCDialogFoundation, "defaultAdapter", {
            get: function () {
                return {
                    addBodyClass: function () { return undefined; },
                    addClass: function () { return undefined; },
                    areButtonsStacked: function () { return false; },
                    clickDefaultButton: function () { return undefined; },
                    eventTargetMatches: function () { return false; },
                    getActionFromEvent: function () { return ''; },
                    hasClass: function () { return false; },
                    isContentScrollable: function () { return false; },
                    notifyClosed: function () { return undefined; },
                    notifyClosing: function () { return undefined; },
                    notifyOpened: function () { return undefined; },
                    notifyOpening: function () { return undefined; },
                    releaseFocus: function () { return undefined; },
                    removeBodyClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    reverseButtons: function () { return undefined; },
                    trapFocus: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCDialogFoundation.prototype.init = function () {
            if (this.adapter_.hasClass(cssClasses$2.STACKED)) {
                this.setAutoStackButtons(false);
            }
        };
        MDCDialogFoundation.prototype.destroy = function () {
            if (this.isOpen_) {
                this.close(strings$2.DESTROY_ACTION);
            }
            if (this.animationTimer_) {
                clearTimeout(this.animationTimer_);
                this.handleAnimationTimerEnd_();
            }
            if (this.layoutFrame_) {
                cancelAnimationFrame(this.layoutFrame_);
                this.layoutFrame_ = 0;
            }
        };
        MDCDialogFoundation.prototype.open = function () {
            var _this = this;
            this.isOpen_ = true;
            this.adapter_.notifyOpening();
            this.adapter_.addClass(cssClasses$2.OPENING);
            // Wait a frame once display is no longer "none", to establish basis for animation
            this.runNextAnimationFrame_(function () {
                _this.adapter_.addClass(cssClasses$2.OPEN);
                _this.adapter_.addBodyClass(cssClasses$2.SCROLL_LOCK);
                _this.layout();
                _this.animationTimer_ = setTimeout(function () {
                    _this.handleAnimationTimerEnd_();
                    _this.adapter_.trapFocus();
                    _this.adapter_.notifyOpened();
                }, numbers$2.DIALOG_ANIMATION_OPEN_TIME_MS);
            });
        };
        MDCDialogFoundation.prototype.close = function (action) {
            var _this = this;
            if (action === void 0) { action = ''; }
            if (!this.isOpen_) {
                // Avoid redundant close calls (and events), e.g. from keydown on elements that inherently emit click
                return;
            }
            this.isOpen_ = false;
            this.adapter_.notifyClosing(action);
            this.adapter_.addClass(cssClasses$2.CLOSING);
            this.adapter_.removeClass(cssClasses$2.OPEN);
            this.adapter_.removeBodyClass(cssClasses$2.SCROLL_LOCK);
            cancelAnimationFrame(this.animationFrame_);
            this.animationFrame_ = 0;
            clearTimeout(this.animationTimer_);
            this.animationTimer_ = setTimeout(function () {
                _this.adapter_.releaseFocus();
                _this.handleAnimationTimerEnd_();
                _this.adapter_.notifyClosed(action);
            }, numbers$2.DIALOG_ANIMATION_CLOSE_TIME_MS);
        };
        MDCDialogFoundation.prototype.isOpen = function () {
            return this.isOpen_;
        };
        MDCDialogFoundation.prototype.getEscapeKeyAction = function () {
            return this.escapeKeyAction_;
        };
        MDCDialogFoundation.prototype.setEscapeKeyAction = function (action) {
            this.escapeKeyAction_ = action;
        };
        MDCDialogFoundation.prototype.getScrimClickAction = function () {
            return this.scrimClickAction_;
        };
        MDCDialogFoundation.prototype.setScrimClickAction = function (action) {
            this.scrimClickAction_ = action;
        };
        MDCDialogFoundation.prototype.getAutoStackButtons = function () {
            return this.autoStackButtons_;
        };
        MDCDialogFoundation.prototype.setAutoStackButtons = function (autoStack) {
            this.autoStackButtons_ = autoStack;
        };
        MDCDialogFoundation.prototype.layout = function () {
            var _this = this;
            if (this.layoutFrame_) {
                cancelAnimationFrame(this.layoutFrame_);
            }
            this.layoutFrame_ = requestAnimationFrame(function () {
                _this.layoutInternal_();
                _this.layoutFrame_ = 0;
            });
        };
        MDCDialogFoundation.prototype.handleInteraction = function (evt) {
            var isClick = evt.type === 'click';
            var isEnter = evt.key === 'Enter' || evt.keyCode === 13;
            var isSpace = evt.key === 'Space' || evt.keyCode === 32;
            var isScrim = this.adapter_.eventTargetMatches(evt.target, strings$2.SCRIM_SELECTOR);
            var isDefault = !this.adapter_.eventTargetMatches(evt.target, strings$2.SUPPRESS_DEFAULT_PRESS_SELECTOR);
            // Check for scrim click first since it doesn't require querying ancestors
            if (isClick && isScrim && this.scrimClickAction_ !== '') {
                this.close(this.scrimClickAction_);
            }
            else if (isClick || isSpace || isEnter) {
                var action = this.adapter_.getActionFromEvent(evt);
                if (action) {
                    this.close(action);
                }
                else if (isEnter && isDefault) {
                    this.adapter_.clickDefaultButton();
                }
            }
        };
        MDCDialogFoundation.prototype.handleDocumentKeydown = function (evt) {
            var isEscape = evt.key === 'Escape' || evt.keyCode === 27;
            if (isEscape && this.escapeKeyAction_ !== '') {
                this.close(this.escapeKeyAction_);
            }
        };
        MDCDialogFoundation.prototype.layoutInternal_ = function () {
            if (this.autoStackButtons_) {
                this.detectStackedButtons_();
            }
            this.detectScrollableContent_();
        };
        MDCDialogFoundation.prototype.handleAnimationTimerEnd_ = function () {
            this.animationTimer_ = 0;
            this.adapter_.removeClass(cssClasses$2.OPENING);
            this.adapter_.removeClass(cssClasses$2.CLOSING);
        };
        /**
         * Runs the given logic on the next animation frame, using setTimeout to factor in Firefox reflow behavior.
         */
        MDCDialogFoundation.prototype.runNextAnimationFrame_ = function (callback) {
            var _this = this;
            cancelAnimationFrame(this.animationFrame_);
            this.animationFrame_ = requestAnimationFrame(function () {
                _this.animationFrame_ = 0;
                clearTimeout(_this.animationTimer_);
                _this.animationTimer_ = setTimeout(callback, 0);
            });
        };
        MDCDialogFoundation.prototype.detectStackedButtons_ = function () {
            // Remove the class first to let us measure the buttons' natural positions.
            this.adapter_.removeClass(cssClasses$2.STACKED);
            var areButtonsStacked = this.adapter_.areButtonsStacked();
            if (areButtonsStacked) {
                this.adapter_.addClass(cssClasses$2.STACKED);
            }
            if (areButtonsStacked !== this.areButtonsStacked_) {
                this.adapter_.reverseButtons();
                this.areButtonsStacked_ = areButtonsStacked;
            }
        };
        MDCDialogFoundation.prototype.detectScrollableContent_ = function () {
            // Remove the class first to let us measure the natural height of the content.
            this.adapter_.removeClass(cssClasses$2.SCROLLABLE);
            if (this.adapter_.isContentScrollable()) {
                this.adapter_.addClass(cssClasses$2.SCROLLABLE);
            }
        };
        return MDCDialogFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2017 Google Inc.
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
    var strings$3 = MDCDialogFoundation.strings;
    var MDCDialog = /** @class */ (function (_super) {
        __extends(MDCDialog, _super);
        function MDCDialog() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Object.defineProperty(MDCDialog.prototype, "isOpen", {
            get: function () {
                return this.foundation_.isOpen();
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCDialog.prototype, "escapeKeyAction", {
            get: function () {
                return this.foundation_.getEscapeKeyAction();
            },
            set: function (action) {
                this.foundation_.setEscapeKeyAction(action);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCDialog.prototype, "scrimClickAction", {
            get: function () {
                return this.foundation_.getScrimClickAction();
            },
            set: function (action) {
                this.foundation_.setScrimClickAction(action);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCDialog.prototype, "autoStackButtons", {
            get: function () {
                return this.foundation_.getAutoStackButtons();
            },
            set: function (autoStack) {
                this.foundation_.setAutoStackButtons(autoStack);
            },
            enumerable: true,
            configurable: true
        });
        MDCDialog.attachTo = function (root) {
            return new MDCDialog(root);
        };
        MDCDialog.prototype.initialize = function (focusTrapFactory, initialFocusEl) {
            var e_1, _a;
            var container = this.root_.querySelector(strings$3.CONTAINER_SELECTOR);
            if (!container) {
                throw new Error("Dialog component requires a " + strings$3.CONTAINER_SELECTOR + " container element");
            }
            this.container_ = container;
            this.content_ = this.root_.querySelector(strings$3.CONTENT_SELECTOR);
            this.buttons_ = [].slice.call(this.root_.querySelectorAll(strings$3.BUTTON_SELECTOR));
            this.defaultButton_ = this.root_.querySelector(strings$3.DEFAULT_BUTTON_SELECTOR);
            this.focusTrapFactory_ = focusTrapFactory;
            this.initialFocusEl_ = initialFocusEl;
            this.buttonRipples_ = [];
            try {
                for (var _b = __values(this.buttons_), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var buttonEl = _c.value;
                    this.buttonRipples_.push(new MDCRipple(buttonEl));
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        };
        MDCDialog.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.focusTrap_ = createFocusTrapInstance(this.container_, this.focusTrapFactory_, this.initialFocusEl_);
            this.handleInteraction_ = this.foundation_.handleInteraction.bind(this.foundation_);
            this.handleDocumentKeydown_ = this.foundation_.handleDocumentKeydown.bind(this.foundation_);
            this.handleLayout_ = this.layout.bind(this);
            var LAYOUT_EVENTS = ['resize', 'orientationchange'];
            this.handleOpening_ = function () {
                LAYOUT_EVENTS.forEach(function (evtType) { return window.addEventListener(evtType, _this.handleLayout_); });
                document.addEventListener('keydown', _this.handleDocumentKeydown_);
            };
            this.handleClosing_ = function () {
                LAYOUT_EVENTS.forEach(function (evtType) { return window.removeEventListener(evtType, _this.handleLayout_); });
                document.removeEventListener('keydown', _this.handleDocumentKeydown_);
            };
            this.listen('click', this.handleInteraction_);
            this.listen('keydown', this.handleInteraction_);
            this.listen(strings$3.OPENING_EVENT, this.handleOpening_);
            this.listen(strings$3.CLOSING_EVENT, this.handleClosing_);
        };
        MDCDialog.prototype.destroy = function () {
            this.unlisten('click', this.handleInteraction_);
            this.unlisten('keydown', this.handleInteraction_);
            this.unlisten(strings$3.OPENING_EVENT, this.handleOpening_);
            this.unlisten(strings$3.CLOSING_EVENT, this.handleClosing_);
            this.handleClosing_();
            this.buttonRipples_.forEach(function (ripple) { return ripple.destroy(); });
            _super.prototype.destroy.call(this);
        };
        MDCDialog.prototype.layout = function () {
            this.foundation_.layout();
        };
        MDCDialog.prototype.open = function () {
            this.foundation_.open();
        };
        MDCDialog.prototype.close = function (action) {
            if (action === void 0) { action = ''; }
            this.foundation_.close(action);
        };
        MDCDialog.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = {
                addBodyClass: function (className) { return document.body.classList.add(className); },
                addClass: function (className) { return _this.root_.classList.add(className); },
                areButtonsStacked: function () { return areTopsMisaligned(_this.buttons_); },
                clickDefaultButton: function () { return _this.defaultButton_ && _this.defaultButton_.click(); },
                eventTargetMatches: function (target, selector) { return target ? matches(target, selector) : false; },
                getActionFromEvent: function (evt) {
                    if (!evt.target) {
                        return '';
                    }
                    var element = closest(evt.target, "[" + strings$3.ACTION_ATTRIBUTE + "]");
                    return element && element.getAttribute(strings$3.ACTION_ATTRIBUTE);
                },
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                isContentScrollable: function () { return isScrollable(_this.content_); },
                notifyClosed: function (action) { return _this.emit(strings$3.CLOSED_EVENT, action ? { action: action } : {}); },
                notifyClosing: function (action) { return _this.emit(strings$3.CLOSING_EVENT, action ? { action: action } : {}); },
                notifyOpened: function () { return _this.emit(strings$3.OPENED_EVENT, {}); },
                notifyOpening: function () { return _this.emit(strings$3.OPENING_EVENT, {}); },
                releaseFocus: function () { return _this.focusTrap_.deactivate(); },
                removeBodyClass: function (className) { return document.body.classList.remove(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                reverseButtons: function () {
                    _this.buttons_.reverse();
                    _this.buttons_.forEach(function (button) {
                        button.parentElement.appendChild(button);
                    });
                },
                trapFocus: function () { return _this.focusTrap_.activate(); },
            };
            return new MDCDialogFoundation(adapter);
        };
        return MDCDialog;
    }(MDCComponent));

    /* src\components\Dialog\Dialog.svelte generated by Svelte v3.6.1 */
    const { console: console_1 } = globals;

    const file$4 = "src\\components\\Dialog\\Dialog.svelte";

    const get_footer_slot_changes = ({}) => ({});
    const get_footer_slot_context = ({}) => ({});

    const get_body_slot_changes = ({}) => ({});
    const get_body_slot_context = ({}) => ({});

    const get_header_slot_changes = ({}) => ({});
    const get_header_slot_context = ({}) => ({});

    function create_fragment$4(ctx) {
    	var div3, div1, div0, h2, h2_id_value, t0, section, section_id_value, section_class_value, t1, footer, t2, div2, div3_aria_labelledby_value, div3_aria_describedby_value, current;

    	const header_slot_1 = ctx.$$slots.header;
    	const header_slot = create_slot(header_slot_1, ctx, get_header_slot_context);

    	const body_slot_1 = ctx.$$slots.body;
    	const body_slot = create_slot(body_slot_1, ctx, get_body_slot_context);

    	const footer_slot_1 = ctx.$$slots.footer;
    	const footer_slot = create_slot(footer_slot_1, ctx, get_footer_slot_context);

    	return {
    		c: function create() {
    			div3 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			h2 = element("h2");

    			if (header_slot) header_slot.c();
    			t0 = space();
    			section = element("section");

    			if (body_slot) body_slot.c();
    			t1 = space();
    			footer = element("footer");

    			if (footer_slot) footer_slot.c();
    			t2 = space();
    			div2 = element("div");

    			attr(h2, "id", h2_id_value = "" + ctx.id + "-label");
    			attr(h2, "class", "mdc-dialog__title");
    			add_location(h2, file$4, 75, 6, 1670);

    			attr(section, "id", section_id_value = "" + ctx.id + "-body");
    			attr(section, "class", section_class_value = "mdc-dialog__content" + (ctx.scrollable?'--scrollable':''));
    			add_location(section, file$4, 78, 6, 1771);

    			attr(footer, "class", "mdc-dialog__actions");
    			add_location(footer, file$4, 84, 6, 1934);
    			attr(div0, "class", "mdc-dialog__surface");
    			add_location(div0, file$4, 74, 4, 1630);
    			attr(div1, "class", "mdc-dialog__container");
    			add_location(div1, file$4, 73, 2, 1590);
    			attr(div2, "class", "mdc-dialog__scrim");
    			add_location(div2, file$4, 89, 2, 2045);
    			attr(div3, "id", ctx.id);
    			attr(div3, "class", "mdc-dialog");
    			attr(div3, "role", "alertdialog");
    			attr(div3, "aria-labelledby", div3_aria_labelledby_value = "" + ctx.id + "-label");
    			attr(div3, "aria-describedby", div3_aria_describedby_value = "" + ctx.id + "-description");
    			add_location(div3, file$4, 66, 0, 1436);
    		},

    		l: function claim(nodes) {
    			if (header_slot) header_slot.l(h2_nodes);

    			if (body_slot) body_slot.l(section_nodes);

    			if (footer_slot) footer_slot.l(footer_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div3, anchor);
    			append(div3, div1);
    			append(div1, div0);
    			append(div0, h2);

    			if (header_slot) {
    				header_slot.m(h2, null);
    			}

    			append(div0, t0);
    			append(div0, section);

    			if (body_slot) {
    				body_slot.m(section, null);
    			}

    			append(div0, t1);
    			append(div0, footer);

    			if (footer_slot) {
    				footer_slot.m(footer, null);
    			}

    			append(div3, t2);
    			append(div3, div2);
    			add_binding_callback(() => ctx.div3_binding(div3, null));
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (header_slot && header_slot.p && changed.$$scope) {
    				header_slot.p(get_slot_changes(header_slot_1, ctx, changed, get_header_slot_changes), get_slot_context(header_slot_1, ctx, get_header_slot_context));
    			}

    			if ((!current || changed.id) && h2_id_value !== (h2_id_value = "" + ctx.id + "-label")) {
    				attr(h2, "id", h2_id_value);
    			}

    			if (body_slot && body_slot.p && changed.$$scope) {
    				body_slot.p(get_slot_changes(body_slot_1, ctx, changed, get_body_slot_changes), get_slot_context(body_slot_1, ctx, get_body_slot_context));
    			}

    			if ((!current || changed.id) && section_id_value !== (section_id_value = "" + ctx.id + "-body")) {
    				attr(section, "id", section_id_value);
    			}

    			if ((!current || changed.scrollable) && section_class_value !== (section_class_value = "mdc-dialog__content" + (ctx.scrollable?'--scrollable':''))) {
    				attr(section, "class", section_class_value);
    			}

    			if (footer_slot && footer_slot.p && changed.$$scope) {
    				footer_slot.p(get_slot_changes(footer_slot_1, ctx, changed, get_footer_slot_changes), get_slot_context(footer_slot_1, ctx, get_footer_slot_context));
    			}

    			if (changed.items) {
    				ctx.div3_binding(null, div3);
    				ctx.div3_binding(div3, null);
    			}

    			if (!current || changed.id) {
    				attr(div3, "id", ctx.id);
    			}

    			if ((!current || changed.id) && div3_aria_labelledby_value !== (div3_aria_labelledby_value = "" + ctx.id + "-label")) {
    				attr(div3, "aria-labelledby", div3_aria_labelledby_value);
    			}

    			if ((!current || changed.id) && div3_aria_describedby_value !== (div3_aria_describedby_value = "" + ctx.id + "-description")) {
    				attr(div3, "aria-describedby", div3_aria_describedby_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(header_slot, local);
    			transition_in(body_slot, local);
    			transition_in(footer_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(header_slot, local);
    			transition_out(body_slot, local);
    			transition_out(footer_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div3);
    			}

    			if (header_slot) header_slot.d(detaching);

    			if (body_slot) body_slot.d(detaching);

    			if (footer_slot) footer_slot.d(detaching);
    			ctx.div3_binding(null, div3);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	
      
      const dispatch = createEventDispatcher();

      let { dialog = null, id = "my", scrollable = false, open = false } = $$props;
      
      let mdcComponent;
      let status;
      /* TODO -- global components
      https://svelte.dev/repl/2e2fcca4c5c44d29b5817d93c60a33ec?version=3.4.4
      */
      onMount(() => {
        mdcComponent = new MDCDialog(dialog);
        mdcComponent.listen("MDCDialog:opening", () => {
          status = undefined;
          dispatch("opening");
        });
        mdcComponent.listen("MDCDialog:opened", () => {
          dispatch("opened");
        });
        mdcComponent.listen("MDCDialog:closing", (e) => {
          dispatch("closing", e.detail);
        });
        mdcComponent.listen("MDCDialog:closed", (e) => {
          status = e.detail.action;
          $$invalidate('open', open = false);
          dispatch("closed", e.detail);
          console.log("closed", e.detail);
        });
      });

      let prevOpen;
      afterUpdate(() => {
        if (open != prevOpen && mdcComponent && open !== mdcComponent.isOpen) {
          if (open) {
            mdcComponent.open();
          } else {
            mdcComponent.close();
          }
        }
        prevOpen = open;
      });

      onDestroy(() => {
        mdcComponent.destroy();
      });

      function show() {
        $$invalidate('open', open = true);
      }

      function getStatus() {
        return status;
      }

    	const writable_props = ['dialog', 'id', 'scrollable', 'open'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1.warn(`<Dialog> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div3_binding($$node, check) {
    		dialog = $$node;
    		$$invalidate('dialog', dialog);
    	}

    	$$self.$set = $$props => {
    		if ('dialog' in $$props) $$invalidate('dialog', dialog = $$props.dialog);
    		if ('id' in $$props) $$invalidate('id', id = $$props.id);
    		if ('scrollable' in $$props) $$invalidate('scrollable', scrollable = $$props.scrollable);
    		if ('open' in $$props) $$invalidate('open', open = $$props.open);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	return {
    		dialog,
    		id,
    		scrollable,
    		open,
    		show,
    		getStatus,
    		div3_binding,
    		$$slots,
    		$$scope
    	};
    }

    class Dialog extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, ["dialog", "id", "scrollable", "open", "show", "getStatus"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.show === undefined && !('show' in props)) {
    			console_1.warn("<Dialog> was created without expected prop 'show'");
    		}
    		if (ctx.getStatus === undefined && !('getStatus' in props)) {
    			console_1.warn("<Dialog> was created without expected prop 'getStatus'");
    		}
    	}

    	get dialog() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dialog(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get scrollable() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scrollable(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get open() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set open(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get show() {
    		return this.$$.ctx.show;
    	}

    	set show(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getStatus() {
    		return this.$$.ctx.getStatus;
    	}

    	set getStatus(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Dialog\DialogButton.svelte generated by Svelte v3.6.1 */

    const file$5 = "src\\components\\Dialog\\DialogButton.svelte";

    // (11:2) {#if label}
    function create_if_block$3(ctx) {
    	var span, t;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(ctx.label);
    			attr(span, "class", "mdc-button__label");
    			add_location(span, file$5, 11, 2, 202);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.label) {
    				set_data(t, ctx.label);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	var button, t, current;

    	var if_block = (ctx.label) && create_if_block$3(ctx);

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			button = element("button");
    			if (if_block) if_block.c();
    			t = space();

    			if (default_slot) default_slot.c();

    			attr(button, "type", "button");
    			attr(button, "class", "mdc-button mdc-dialog__button");
    			button.dataset.mdcDialogAction = ctx.action;
    			add_location(button, file$5, 5, 0, 78);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(button_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, button, anchor);
    			if (if_block) if_block.m(button, null);
    			append(button, t);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (ctx.label) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					if_block.m(button, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (!current || changed.action) {
    				button.dataset.mdcDialogAction = ctx.action;
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(button);
    			}

    			if (if_block) if_block.d();

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { label = "", action = null } = $$props;

    	const writable_props = ['label', 'action'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<DialogButton> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('label' in $$props) $$invalidate('label', label = $$props.label);
    		if ('action' in $$props) $$invalidate('action', action = $$props.action);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	return { label, action, $$slots, $$scope };
    }

    class DialogButton extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, ["label", "action"]);
    	}

    	get label() {
    		throw new Error("<DialogButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<DialogButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get action() {
    		throw new Error("<DialogButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set action(value) {
    		throw new Error("<DialogButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Typography\Body.svelte generated by Svelte v3.6.1 */

    const file$6 = "src\\components\\Typography\\Body.svelte";

    function create_fragment$6(ctx) {
    	var p, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			p = element("p");

    			if (default_slot) default_slot.c();

    			attr(p, "class", "" + ctx.classes + " svelte-tzrf30");
    			add_location(p, file$6, 13, 0, 260);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(p_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, p, anchor);

    			if (default_slot) {
    				default_slot.m(p, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (!current || changed.classes) {
    				attr(p, "class", "" + ctx.classes + " svelte-tzrf30");
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(p);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { adjustMargin = '', level = 1, classes } = $$props;

    	const writable_props = ['adjustMargin', 'level', 'classes'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Body> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('adjustMargin' in $$props) $$invalidate('adjustMargin', adjustMargin = $$props.adjustMargin);
    		if ('level' in $$props) $$invalidate('level', level = $$props.level);
    		if ('classes' in $$props) $$invalidate('classes', classes = $$props.classes);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { level: 1, adjustMargin: 1 }) => {
    		if ($$dirty.level || $$dirty.adjustMargin) { {
          const classList = ['mdc-typography--body' + level];
          adjustMargin && classList.push('mdc-typography--adjust-margin');
        
          $$invalidate('classes', classes = classList.join(' '));
        } }
    	};

    	return {
    		adjustMargin,
    		level,
    		classes,
    		$$slots,
    		$$scope
    	};
    }

    class Body extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, ["adjustMargin", "level", "classes"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.classes === undefined && !('classes' in props)) {
    			console.warn("<Body> was created without expected prop 'classes'");
    		}
    	}

    	get adjustMargin() {
    		throw new Error("<Body>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set adjustMargin(value) {
    		throw new Error("<Body>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get level() {
    		throw new Error("<Body>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set level(value) {
    		throw new Error("<Body>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<Body>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Body>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Typography\Display.svelte generated by Svelte v3.6.1 */

    const file$7 = "src\\components\\Typography\\Display.svelte";

    function create_fragment$7(ctx) {
    	var h1, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			h1 = element("h1");

    			if (default_slot) default_slot.c();

    			attr(h1, "class", ctx.classes);
    			add_location(h1, file$7, 13, 0, 263);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(h1_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, h1, anchor);

    			if (default_slot) {
    				default_slot.m(h1, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (!current || changed.classes) {
    				attr(h1, "class", ctx.classes);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(h1);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { adjustMargin = '', level = 1, classes } = $$props;

    	const writable_props = ['adjustMargin', 'level', 'classes'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Display> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('adjustMargin' in $$props) $$invalidate('adjustMargin', adjustMargin = $$props.adjustMargin);
    		if ('level' in $$props) $$invalidate('level', level = $$props.level);
    		if ('classes' in $$props) $$invalidate('classes', classes = $$props.classes);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { level: 1, adjustMargin: 1 }) => {
    		if ($$dirty.level || $$dirty.adjustMargin) { {
          const classList = ['mdc-typography--display' + level];
          adjustMargin && classList.push('mdc-typography--adjust-margin');
        
          $$invalidate('classes', classes = classList.join(' '));
        } }
    	};

    	return {
    		adjustMargin,
    		level,
    		classes,
    		$$slots,
    		$$scope
    	};
    }

    class Display extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, ["adjustMargin", "level", "classes"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.classes === undefined && !('classes' in props)) {
    			console.warn("<Display> was created without expected prop 'classes'");
    		}
    	}

    	get adjustMargin() {
    		throw new Error("<Display>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set adjustMargin(value) {
    		throw new Error("<Display>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get level() {
    		throw new Error("<Display>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set level(value) {
    		throw new Error("<Display>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<Display>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Display>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Typography\Headline.svelte generated by Svelte v3.6.1 */

    const file$8 = "src\\components\\Typography\\Headline.svelte";

    function create_fragment$8(ctx) {
    	var h1, h1_class_value, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			h1 = element("h1");

    			if (default_slot) default_slot.c();

    			attr(h1, "class", h1_class_value = "mdc-typography--headline " + ctx.classes);
    			add_location(h1, file$8, 7, 0, 139);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(h1_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, h1, anchor);

    			if (default_slot) {
    				default_slot.m(h1, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if ((!current || changed.classes) && h1_class_value !== (h1_class_value = "mdc-typography--headline " + ctx.classes)) {
    				attr(h1, "class", h1_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(h1);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { adjustMargin = '', classes } = $$props;

    	const writable_props = ['adjustMargin', 'classes'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Headline> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('adjustMargin' in $$props) $$invalidate('adjustMargin', adjustMargin = $$props.adjustMargin);
    		if ('classes' in $$props) $$invalidate('classes', classes = $$props.classes);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { adjustMargin: 1 }) => {
    		if ($$dirty.adjustMargin) { $$invalidate('classes', classes = adjustMargin && 'mdc-typography--adjust-margin'); }
    	};

    	return { adjustMargin, classes, $$slots, $$scope };
    }

    class Headline extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, ["adjustMargin", "classes"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.classes === undefined && !('classes' in props)) {
    			console.warn("<Headline> was created without expected prop 'classes'");
    		}
    	}

    	get adjustMargin() {
    		throw new Error("<Headline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set adjustMargin(value) {
    		throw new Error("<Headline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<Headline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Headline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Typography\Title.svelte generated by Svelte v3.6.1 */

    const file$9 = "src\\components\\Typography\\Title.svelte";

    function create_fragment$9(ctx) {
    	var h2, h2_class_value, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			h2 = element("h2");

    			if (default_slot) default_slot.c();

    			attr(h2, "class", h2_class_value = "mdc-typography--title " + ctx.classes + " svelte-tzrf30");
    			add_location(h2, file$9, 7, 0, 139);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(h2_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, h2, anchor);

    			if (default_slot) {
    				default_slot.m(h2, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if ((!current || changed.classes) && h2_class_value !== (h2_class_value = "mdc-typography--title " + ctx.classes + " svelte-tzrf30")) {
    				attr(h2, "class", h2_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(h2);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { adjustMargin = '', classes } = $$props;

    	const writable_props = ['adjustMargin', 'classes'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Title> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('adjustMargin' in $$props) $$invalidate('adjustMargin', adjustMargin = $$props.adjustMargin);
    		if ('classes' in $$props) $$invalidate('classes', classes = $$props.classes);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { adjustMargin: 1 }) => {
    		if ($$dirty.adjustMargin) { $$invalidate('classes', classes = adjustMargin && 'mdc-typography--adjust-margin'); }
    	};

    	return { adjustMargin, classes, $$slots, $$scope };
    }

    class Title extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, ["adjustMargin", "classes"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.classes === undefined && !('classes' in props)) {
    			console.warn("<Title> was created without expected prop 'classes'");
    		}
    	}

    	get adjustMargin() {
    		throw new Error("<Title>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set adjustMargin(value) {
    		throw new Error("<Title>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<Title>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Title>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Typography\Subheading.svelte generated by Svelte v3.6.1 */

    const file$a = "src\\components\\Typography\\Subheading.svelte";

    // (18:0) {:else}
    function create_else_block$1(ctx) {
    	var h4, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			h4 = element("h4");

    			if (default_slot) default_slot.c();

    			attr(h4, "class", ctx.classes);
    			add_location(h4, file$a, 18, 2, 346);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(h4_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, h4, anchor);

    			if (default_slot) {
    				default_slot.m(h4, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (!current || changed.classes) {
    				attr(h4, "class", ctx.classes);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(h4);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (14:0) {#if level < 2}
    function create_if_block$4(ctx) {
    	var h3, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			h3 = element("h3");

    			if (default_slot) default_slot.c();

    			attr(h3, "class", ctx.classes);
    			add_location(h3, file$a, 14, 2, 292);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(h3_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, h3, anchor);

    			if (default_slot) {
    				default_slot.m(h3, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (!current || changed.classes) {
    				attr(h3, "class", ctx.classes);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(h3);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	var current_block_type_index, if_block, if_block_anchor, current;

    	var if_block_creators = [
    		create_if_block$4,
    		create_else_block$1
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.level < 2) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
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

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { adjustMargin = '', level = 1, classes } = $$props;

    	const writable_props = ['adjustMargin', 'level', 'classes'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Subheading> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('adjustMargin' in $$props) $$invalidate('adjustMargin', adjustMargin = $$props.adjustMargin);
    		if ('level' in $$props) $$invalidate('level', level = $$props.level);
    		if ('classes' in $$props) $$invalidate('classes', classes = $$props.classes);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { level: 1, adjustMargin: 1 }) => {
    		if ($$dirty.level || $$dirty.adjustMargin) { {
            const classList = ['mdc-typography--subheading' + level];
            adjustMargin && classList.push('mdc-typography--adjust-margin');
        
            $$invalidate('classes', classes = classList.join(' '));
          } }
    	};

    	return {
    		adjustMargin,
    		level,
    		classes,
    		$$slots,
    		$$scope
    	};
    }

    class Subheading extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, ["adjustMargin", "level", "classes"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.classes === undefined && !('classes' in props)) {
    			console.warn("<Subheading> was created without expected prop 'classes'");
    		}
    	}

    	get adjustMargin() {
    		throw new Error("<Subheading>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set adjustMargin(value) {
    		throw new Error("<Subheading>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get level() {
    		throw new Error("<Subheading>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set level(value) {
    		throw new Error("<Subheading>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<Subheading>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Subheading>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\LayoutGrid\LayoutGrid.svelte generated by Svelte v3.6.1 */

    const file$b = "src\\components\\LayoutGrid\\LayoutGrid.svelte";

    function create_fragment$b(ctx) {
    	var div, div_class_value, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			div = element("div");

    			if (default_slot) default_slot.c();

    			attr(div, "class", div_class_value = "mdc-layout-grid " + ctx.classes);
    			add_location(div, file$b, 16, 0, 396);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(div_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if ((!current || changed.classes) && div_class_value !== (div_class_value = "mdc-layout-grid " + ctx.classes)) {
    				attr(div, "class", div_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { fixedColumnWidth = '', align = '', classes } = $$props;

    	const writable_props = ['fixedColumnWidth', 'align', 'classes'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<LayoutGrid> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('fixedColumnWidth' in $$props) $$invalidate('fixedColumnWidth', fixedColumnWidth = $$props.fixedColumnWidth);
    		if ('align' in $$props) $$invalidate('align', align = $$props.align);
    		if ('classes' in $$props) $$invalidate('classes', classes = $$props.classes);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { fixedColumnWidth: 1, align: 1 }) => {
    		if ($$dirty.fixedColumnWidth || $$dirty.align) { {
            const classList = [];
        
            fixedColumnWidth && classList.push('mdc-layout-grid--fixed-column-width');
            align === 'left' && classList.push('mdc-layout-grid--align-left');
            align === 'right' && classList.push('mdc-layout-grid--align-right');
        
            $$invalidate('classes', classes = classList.join(' '));
          } }
    	};

    	return {
    		fixedColumnWidth,
    		align,
    		classes,
    		$$slots,
    		$$scope
    	};
    }

    class LayoutGrid extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, ["fixedColumnWidth", "align", "classes"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.classes === undefined && !('classes' in props)) {
    			console.warn("<LayoutGrid> was created without expected prop 'classes'");
    		}
    	}

    	get fixedColumnWidth() {
    		throw new Error("<LayoutGrid>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fixedColumnWidth(value) {
    		throw new Error("<LayoutGrid>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get align() {
    		throw new Error("<LayoutGrid>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set align(value) {
    		throw new Error("<LayoutGrid>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<LayoutGrid>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<LayoutGrid>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\LayoutGrid\LayoutGridCell.svelte generated by Svelte v3.6.1 */

    const file$c = "src\\components\\LayoutGrid\\LayoutGridCell.svelte";

    function create_fragment$c(ctx) {
    	var div, div_class_value, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			div = element("div");

    			if (default_slot) default_slot.c();

    			attr(div, "class", div_class_value = "mdc-layout-grid__cell " + ctx.classes);
    			add_location(div, file$c, 23, 0, 753);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(div_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if ((!current || changed.classes) && div_class_value !== (div_class_value = "mdc-layout-grid__cell " + ctx.classes)) {
    				attr(div, "class", div_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let { span = '', spanDesktop = '', spanTablet = '', spanPhone = '', align = '', order = '', classes } = $$props;

    	const writable_props = ['span', 'spanDesktop', 'spanTablet', 'spanPhone', 'align', 'order', 'classes'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<LayoutGridCell> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('span' in $$props) $$invalidate('span', span = $$props.span);
    		if ('spanDesktop' in $$props) $$invalidate('spanDesktop', spanDesktop = $$props.spanDesktop);
    		if ('spanTablet' in $$props) $$invalidate('spanTablet', spanTablet = $$props.spanTablet);
    		if ('spanPhone' in $$props) $$invalidate('spanPhone', spanPhone = $$props.spanPhone);
    		if ('align' in $$props) $$invalidate('align', align = $$props.align);
    		if ('order' in $$props) $$invalidate('order', order = $$props.order);
    		if ('classes' in $$props) $$invalidate('classes', classes = $$props.classes);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { span: 1, spanDesktop: 1, spanTablet: 1, spanPhone: 1, align: 1, order: 1 }) => {
    		if ($$dirty.span || $$dirty.spanDesktop || $$dirty.spanTablet || $$dirty.spanPhone || $$dirty.align || $$dirty.order) { {
            const classList = [];
        
            span && classList.push('mdc-layout-grid__cell--span-' + span);
            spanDesktop && classList.push('mdc-layout-grid__cell--span-' + spanDesktop + '-desktop');
            spanTablet && classList.push('mdc-layout-grid__cell--span-' + spanTablet + '-tablet');
            spanPhone && classList.push('mdc-layout-grid__cell--span-' + spanPhone + '-phone');
            align && classList.push('mdc-layout-grid__cell--align-' + align);
            order && classList.push('mdc-layout-grid__cell--order-' + order);
        
            $$invalidate('classes', classes = classList.join(' '));
          } }
    	};

    	return {
    		span,
    		spanDesktop,
    		spanTablet,
    		spanPhone,
    		align,
    		order,
    		classes,
    		$$slots,
    		$$scope
    	};
    }

    class LayoutGridCell extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, ["span", "spanDesktop", "spanTablet", "spanPhone", "align", "order", "classes"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.classes === undefined && !('classes' in props)) {
    			console.warn("<LayoutGridCell> was created without expected prop 'classes'");
    		}
    	}

    	get span() {
    		throw new Error("<LayoutGridCell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set span(value) {
    		throw new Error("<LayoutGridCell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get spanDesktop() {
    		throw new Error("<LayoutGridCell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set spanDesktop(value) {
    		throw new Error("<LayoutGridCell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get spanTablet() {
    		throw new Error("<LayoutGridCell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set spanTablet(value) {
    		throw new Error("<LayoutGridCell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get spanPhone() {
    		throw new Error("<LayoutGridCell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set spanPhone(value) {
    		throw new Error("<LayoutGridCell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get align() {
    		throw new Error("<LayoutGridCell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set align(value) {
    		throw new Error("<LayoutGridCell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get order() {
    		throw new Error("<LayoutGridCell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set order(value) {
    		throw new Error("<LayoutGridCell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<LayoutGridCell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<LayoutGridCell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\LayoutGrid\LayoutGridInner.svelte generated by Svelte v3.6.1 */

    const file$d = "src\\components\\LayoutGrid\\LayoutGridInner.svelte";

    function create_fragment$d(ctx) {
    	var div, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			div = element("div");

    			if (default_slot) default_slot.c();

    			attr(div, "class", "mdc-layout-grid__inner");
    			add_location(div, file$d, 0, 0, 0);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(div_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$d($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	return { $$slots, $$scope };
    }

    class LayoutGridInner extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$d, create_fragment$d, safe_not_equal, []);
    	}
    }

    /**
     * @license
     * Copyright 2017 Google Inc.
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
        CLOSED_CLASS: 'mdc-linear-progress--closed',
        INDETERMINATE_CLASS: 'mdc-linear-progress--indeterminate',
        REVERSED_CLASS: 'mdc-linear-progress--reversed',
    };
    var strings$4 = {
        BUFFER_SELECTOR: '.mdc-linear-progress__buffer',
        PRIMARY_BAR_SELECTOR: '.mdc-linear-progress__primary-bar',
    };

    /**
     * @license
     * Copyright 2017 Google Inc.
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
    var MDCLinearProgressFoundation = /** @class */ (function (_super) {
        __extends(MDCLinearProgressFoundation, _super);
        function MDCLinearProgressFoundation(adapter) {
            return _super.call(this, __assign({}, MDCLinearProgressFoundation.defaultAdapter, adapter)) || this;
        }
        Object.defineProperty(MDCLinearProgressFoundation, "cssClasses", {
            get: function () {
                return cssClasses$3;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCLinearProgressFoundation, "strings", {
            get: function () {
                return strings$4;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCLinearProgressFoundation, "defaultAdapter", {
            get: function () {
                return {
                    addClass: function () { return undefined; },
                    getBuffer: function () { return null; },
                    getPrimaryBar: function () { return null; },
                    hasClass: function () { return false; },
                    removeClass: function () { return undefined; },
                    setStyle: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCLinearProgressFoundation.prototype.init = function () {
            this.isDeterminate_ = !this.adapter_.hasClass(cssClasses$3.INDETERMINATE_CLASS);
            this.isReversed_ = this.adapter_.hasClass(cssClasses$3.REVERSED_CLASS);
            this.progress_ = 0;
        };
        MDCLinearProgressFoundation.prototype.setDeterminate = function (isDeterminate) {
            this.isDeterminate_ = isDeterminate;
            if (this.isDeterminate_) {
                this.adapter_.removeClass(cssClasses$3.INDETERMINATE_CLASS);
                this.setScale_(this.adapter_.getPrimaryBar(), this.progress_);
            }
            else {
                this.adapter_.addClass(cssClasses$3.INDETERMINATE_CLASS);
                this.setScale_(this.adapter_.getPrimaryBar(), 1);
                this.setScale_(this.adapter_.getBuffer(), 1);
            }
        };
        MDCLinearProgressFoundation.prototype.setProgress = function (value) {
            this.progress_ = value;
            if (this.isDeterminate_) {
                this.setScale_(this.adapter_.getPrimaryBar(), value);
            }
        };
        MDCLinearProgressFoundation.prototype.setBuffer = function (value) {
            if (this.isDeterminate_) {
                this.setScale_(this.adapter_.getBuffer(), value);
            }
        };
        MDCLinearProgressFoundation.prototype.setReverse = function (isReversed) {
            this.isReversed_ = isReversed;
            if (this.isReversed_) {
                this.adapter_.addClass(cssClasses$3.REVERSED_CLASS);
            }
            else {
                this.adapter_.removeClass(cssClasses$3.REVERSED_CLASS);
            }
        };
        MDCLinearProgressFoundation.prototype.open = function () {
            this.adapter_.removeClass(cssClasses$3.CLOSED_CLASS);
        };
        MDCLinearProgressFoundation.prototype.close = function () {
            this.adapter_.addClass(cssClasses$3.CLOSED_CLASS);
        };
        MDCLinearProgressFoundation.prototype.setScale_ = function (el, scaleValue) {
            if (!el) {
                return;
            }
            var value = "scaleX(" + scaleValue + ")";
            this.adapter_.setStyle(el, getCorrectPropertyName(window, 'transform'), value);
        };
        return MDCLinearProgressFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2017 Google Inc.
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
    var MDCLinearProgress = /** @class */ (function (_super) {
        __extends(MDCLinearProgress, _super);
        function MDCLinearProgress() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCLinearProgress.attachTo = function (root) {
            return new MDCLinearProgress(root);
        };
        Object.defineProperty(MDCLinearProgress.prototype, "determinate", {
            set: function (value) {
                this.foundation_.setDeterminate(value);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCLinearProgress.prototype, "progress", {
            set: function (value) {
                this.foundation_.setProgress(value);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCLinearProgress.prototype, "buffer", {
            set: function (value) {
                this.foundation_.setBuffer(value);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCLinearProgress.prototype, "reverse", {
            set: function (value) {
                this.foundation_.setReverse(value);
            },
            enumerable: true,
            configurable: true
        });
        MDCLinearProgress.prototype.open = function () {
            this.foundation_.open();
        };
        MDCLinearProgress.prototype.close = function () {
            this.foundation_.close();
        };
        MDCLinearProgress.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                getBuffer: function () { return _this.root_.querySelector(MDCLinearProgressFoundation.strings.BUFFER_SELECTOR); },
                getPrimaryBar: function () { return _this.root_.querySelector(MDCLinearProgressFoundation.strings.PRIMARY_BAR_SELECTOR); },
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                setStyle: function (el, styleProperty, value) { return el.style.setProperty(styleProperty, value); },
            };
            return new MDCLinearProgressFoundation(adapter);
        };
        return MDCLinearProgress;
    }(MDCComponent));

    /* src\components\LinearProgress\LinearProgress.svelte generated by Svelte v3.6.1 */

    const file$e = "src\\components\\LinearProgress\\LinearProgress.svelte";

    function create_fragment$e(ctx) {
    	var div4, div0, t0, div1, t1, div2, span0, t2, div3, span1;

    	return {
    		c: function create() {
    			div4 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			t1 = space();
    			div2 = element("div");
    			span0 = element("span");
    			t2 = space();
    			div3 = element("div");
    			span1 = element("span");
    			attr(div0, "class", "mdc-linear-progress__buffering-dots");
    			add_location(div0, file$e, 38, 2, 947);
    			attr(div1, "class", "mdc-linear-progress__buffer");
    			add_location(div1, file$e, 39, 2, 1005);
    			attr(span0, "class", "mdc-linear-progress__bar-inner");
    			add_location(span0, file$e, 41, 4, 1131);
    			attr(div2, "class", "mdc-linear-progress__bar mdc-linear-progress__primary-bar");
    			add_location(div2, file$e, 40, 2, 1055);
    			attr(span1, "class", "mdc-linear-progress__bar-inner");
    			add_location(span1, file$e, 44, 4, 1273);
    			attr(div3, "class", "mdc-linear-progress__bar mdc-linear-progress__secondary-bar");
    			add_location(div3, file$e, 43, 2, 1195);
    			attr(div4, "class", "mdc-linear-progress");
    			add_location(div4, file$e, 37, 0, 892);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div4, anchor);
    			append(div4, div0);
    			append(div4, t0);
    			append(div4, div1);
    			append(div4, t1);
    			append(div4, div2);
    			append(div2, span0);
    			append(div4, t2);
    			append(div4, div3);
    			append(div3, span1);
    			add_binding_callback(() => ctx.div4_binding(div4, null));
    		},

    		p: function update(changed, ctx) {
    			if (changed.items) {
    				ctx.div4_binding(null, div4);
    				ctx.div4_binding(div4, null);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div4);
    			}

    			ctx.div4_binding(null, div4);
    		}
    	};
    }

    function instance$e($$self, $$props, $$invalidate) {
    	

      let { self = null, open = false, reverse = false, indeterminate = true, progress = 0, buffer = 0 } = $$props;

      let mdcComponent;

      onMount(() => {
        $$invalidate('mdcComponent', mdcComponent = new MDCLinearProgress(self));
      });

      onDestroy(() => {
        mdcComponent.destroy();
      });

      function openClose() {
        if (open) {
          mdcComponent.open();
        } else {
          mdcComponent.close();
        }
      }

    	const writable_props = ['self', 'open', 'reverse', 'indeterminate', 'progress', 'buffer'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<LinearProgress> was created with unknown prop '${key}'`);
    	});

    	function div4_binding($$node, check) {
    		self = $$node;
    		$$invalidate('self', self);
    	}

    	$$self.$set = $$props => {
    		if ('self' in $$props) $$invalidate('self', self = $$props.self);
    		if ('open' in $$props) $$invalidate('open', open = $$props.open);
    		if ('reverse' in $$props) $$invalidate('reverse', reverse = $$props.reverse);
    		if ('indeterminate' in $$props) $$invalidate('indeterminate', indeterminate = $$props.indeterminate);
    		if ('progress' in $$props) $$invalidate('progress', progress = $$props.progress);
    		if ('buffer' in $$props) $$invalidate('buffer', buffer = $$props.buffer);
    	};

    	$$self.$$.update = ($$dirty = { reverse: 1, mdcComponent: 1, buffer: 1, indeterminate: 1, progress: 1, open: 1 }) => {
    		if ($$dirty.reverse || $$dirty.mdcComponent) { mdcComponent && (mdcComponent.reverse = reverse); $$invalidate('mdcComponent', mdcComponent), $$invalidate('reverse', reverse), $$invalidate('buffer', buffer), $$invalidate('indeterminate', indeterminate), $$invalidate('progress', progress); }
    		if ($$dirty.buffer || $$dirty.mdcComponent) { mdcComponent && (mdcComponent.buffer = buffer); $$invalidate('mdcComponent', mdcComponent), $$invalidate('reverse', reverse), $$invalidate('buffer', buffer), $$invalidate('indeterminate', indeterminate), $$invalidate('progress', progress); }
    		if ($$dirty.indeterminate || $$dirty.mdcComponent) { mdcComponent && (mdcComponent.indeterminate = indeterminate); $$invalidate('mdcComponent', mdcComponent), $$invalidate('reverse', reverse), $$invalidate('buffer', buffer), $$invalidate('indeterminate', indeterminate), $$invalidate('progress', progress); }
    		if ($$dirty.progress || $$dirty.mdcComponent) { mdcComponent && (mdcComponent.progress = progress); $$invalidate('mdcComponent', mdcComponent), $$invalidate('reverse', reverse), $$invalidate('buffer', buffer), $$invalidate('indeterminate', indeterminate), $$invalidate('progress', progress); }
    		if ($$dirty.open || $$dirty.mdcComponent) { mdcComponent && openClose(); }
    	};

    	return {
    		self,
    		open,
    		reverse,
    		indeterminate,
    		progress,
    		buffer,
    		div4_binding
    	};
    }

    class LinearProgress extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, ["self", "open", "reverse", "indeterminate", "progress", "buffer"]);
    	}

    	get self() {
    		throw new Error("<LinearProgress>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set self(value) {
    		throw new Error("<LinearProgress>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get open() {
    		throw new Error("<LinearProgress>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set open(value) {
    		throw new Error("<LinearProgress>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get reverse() {
    		throw new Error("<LinearProgress>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set reverse(value) {
    		throw new Error("<LinearProgress>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get indeterminate() {
    		throw new Error("<LinearProgress>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set indeterminate(value) {
    		throw new Error("<LinearProgress>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get progress() {
    		throw new Error("<LinearProgress>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set progress(value) {
    		throw new Error("<LinearProgress>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get buffer() {
    		throw new Error("<LinearProgress>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set buffer(value) {
    		throw new Error("<LinearProgress>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Icon\Icon.svelte generated by Svelte v3.6.1 */

    const file$f = "src\\components\\Icon\\Icon.svelte";

    function create_fragment$f(ctx) {
    	var i, t, dispose;

    	return {
    		c: function create() {
    			i = element("i");
    			t = text(ctx.icon);
    			attr(i, "class", "material-icons");
    			add_location(i, file$f, 12, 0, 205);
    			dispose = listen(i, "click", ctx.clicked);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, i, anchor);
    			append(i, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.icon) {
    				set_data(t, ctx.icon);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(i);
    			}

    			dispose();
    		}
    	};
    }

    function instance$f($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();

      let { icon = '' } = $$props;

      function clicked() {
        dispatch('icon-clicked');
      }

    	const writable_props = ['icon'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Icon> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('icon' in $$props) $$invalidate('icon', icon = $$props.icon);
    	};

    	return { icon, clicked };
    }

    class Icon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$f, create_fragment$f, safe_not_equal, ["icon", "clicked"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.clicked === undefined && !('clicked' in props)) {
    			console.warn("<Icon> was created without expected prop 'clicked'");
    		}
    	}

    	get icon() {
    		throw new Error("<Icon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get clicked() {
    		return this.$$.ctx.clicked;
    	}

    	set clicked(value) {
    		throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
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
    var cssClasses$4 = {
        ICON_BUTTON_ON: 'mdc-icon-button--on',
        ROOT: 'mdc-icon-button',
    };
    var strings$5 = {
        ARIA_PRESSED: 'aria-pressed',
        CHANGE_EVENT: 'MDCIconButtonToggle:change',
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
    var MDCIconButtonToggleFoundation = /** @class */ (function (_super) {
        __extends(MDCIconButtonToggleFoundation, _super);
        function MDCIconButtonToggleFoundation(adapter) {
            return _super.call(this, __assign({}, MDCIconButtonToggleFoundation.defaultAdapter, adapter)) || this;
        }
        Object.defineProperty(MDCIconButtonToggleFoundation, "cssClasses", {
            get: function () {
                return cssClasses$4;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCIconButtonToggleFoundation, "strings", {
            get: function () {
                return strings$5;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCIconButtonToggleFoundation, "defaultAdapter", {
            get: function () {
                return {
                    addClass: function () { return undefined; },
                    hasClass: function () { return false; },
                    notifyChange: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    setAttr: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCIconButtonToggleFoundation.prototype.init = function () {
            this.adapter_.setAttr(strings$5.ARIA_PRESSED, "" + this.isOn());
        };
        MDCIconButtonToggleFoundation.prototype.handleClick = function () {
            this.toggle();
            this.adapter_.notifyChange({ isOn: this.isOn() });
        };
        MDCIconButtonToggleFoundation.prototype.isOn = function () {
            return this.adapter_.hasClass(cssClasses$4.ICON_BUTTON_ON);
        };
        MDCIconButtonToggleFoundation.prototype.toggle = function (isOn) {
            if (isOn === void 0) { isOn = !this.isOn(); }
            if (isOn) {
                this.adapter_.addClass(cssClasses$4.ICON_BUTTON_ON);
            }
            else {
                this.adapter_.removeClass(cssClasses$4.ICON_BUTTON_ON);
            }
            this.adapter_.setAttr(strings$5.ARIA_PRESSED, "" + isOn);
        };
        return MDCIconButtonToggleFoundation;
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
    var strings$6 = MDCIconButtonToggleFoundation.strings;
    var MDCIconButtonToggle = /** @class */ (function (_super) {
        __extends(MDCIconButtonToggle, _super);
        function MDCIconButtonToggle() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ripple_ = _this.createRipple_();
            return _this;
        }
        MDCIconButtonToggle.attachTo = function (root) {
            return new MDCIconButtonToggle(root);
        };
        MDCIconButtonToggle.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.handleClick_ = function () { return _this.foundation_.handleClick(); };
            this.listen('click', this.handleClick_);
        };
        MDCIconButtonToggle.prototype.destroy = function () {
            this.unlisten('click', this.handleClick_);
            this.ripple_.destroy();
            _super.prototype.destroy.call(this);
        };
        MDCIconButtonToggle.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                notifyChange: function (evtData) { return _this.emit(strings$6.CHANGE_EVENT, evtData); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                setAttr: function (attrName, attrValue) { return _this.root_.setAttribute(attrName, attrValue); },
            };
            return new MDCIconButtonToggleFoundation(adapter);
        };
        Object.defineProperty(MDCIconButtonToggle.prototype, "ripple", {
            get: function () {
                return this.ripple_;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCIconButtonToggle.prototype, "on", {
            get: function () {
                return this.foundation_.isOn();
            },
            set: function (isOn) {
                this.foundation_.toggle(isOn);
            },
            enumerable: true,
            configurable: true
        });
        MDCIconButtonToggle.prototype.createRipple_ = function () {
            var ripple = new MDCRipple(this.root_);
            ripple.unbounded = true;
            return ripple;
        };
        return MDCIconButtonToggle;
    }(MDCComponent));

    /* src\components\IconButton\IconToggle.svelte generated by Svelte v3.6.1 */

    const file$g = "src\\components\\IconButton\\IconToggle.svelte";

    function create_fragment$g(ctx) {
    	var button, i, t, i_class_value, dispose;

    	return {
    		c: function create() {
    			button = element("button");
    			i = element("i");
    			t = text(ctx.icon);
    			attr(i, "class", i_class_value = "material-icons " + ctx.classes);
    			add_location(i, file$g, 70, 2, 1648);
    			attr(button, "class", "mdc-icon-button");
    			button.disabled = ctx.disabled;
    			add_location(button, file$g, 66, 0, 1560);
    			dispose = listen(i, "click", ctx.onClick);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, button, anchor);
    			append(button, i);
    			append(i, t);
    			add_binding_callback(() => ctx.button_binding(button, null));
    		},

    		p: function update(changed, ctx) {
    			if (changed.icon) {
    				set_data(t, ctx.icon);
    			}

    			if ((changed.classes) && i_class_value !== (i_class_value = "material-icons " + ctx.classes)) {
    				attr(i, "class", i_class_value);
    			}

    			if (changed.items) {
    				ctx.button_binding(null, button);
    				ctx.button_binding(button, null);
    			}

    			if (changed.disabled) {
    				button.disabled = ctx.disabled;
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(button);
    			}

    			ctx.button_binding(null, button);
    			dispose();
    		}
    	};
    }

    function instance$g($$self, $$props, $$invalidate) {
    	

      const dispatch = createEventDispatcher();

      let { iconButton = null, ripple = false, disabled = false, primary = false, accent = false, value = false, iconOn = '', iconOff = '', isToggleButton = false } = $$props;

      let mdcComponent, mdcRipple, prevRipple;
      let mdc = { mdcComponent, mdcRipple, ripple, prevRipple };

      onMount(() => {
        $$invalidate('mdcComponent', mdcComponent = MDCIconButtonToggle.attachTo(iconButton));
        mdcAfterUpdate(iconButton, mdc, true);
        mdcOnDestroy(mdc);
      });

      let { classes } = $$props;

      let { icon } = $$props;

      function toggleValue() {
        if (isToggleButton) {
          $$invalidate('value', value = !value);
          dispatch('input', { value });
        } else {
          dispatch('icon-clicked');
        }    
      }

      function onClick() {
        debounce(toggleValue)();
      }

    	const writable_props = ['iconButton', 'ripple', 'disabled', 'primary', 'accent', 'value', 'iconOn', 'iconOff', 'isToggleButton', 'classes', 'icon'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<IconToggle> was created with unknown prop '${key}'`);
    	});

    	function button_binding($$node, check) {
    		iconButton = $$node;
    		$$invalidate('iconButton', iconButton);
    	}

    	$$self.$set = $$props => {
    		if ('iconButton' in $$props) $$invalidate('iconButton', iconButton = $$props.iconButton);
    		if ('ripple' in $$props) $$invalidate('ripple', ripple = $$props.ripple);
    		if ('disabled' in $$props) $$invalidate('disabled', disabled = $$props.disabled);
    		if ('primary' in $$props) $$invalidate('primary', primary = $$props.primary);
    		if ('accent' in $$props) $$invalidate('accent', accent = $$props.accent);
    		if ('value' in $$props) $$invalidate('value', value = $$props.value);
    		if ('iconOn' in $$props) $$invalidate('iconOn', iconOn = $$props.iconOn);
    		if ('iconOff' in $$props) $$invalidate('iconOff', iconOff = $$props.iconOff);
    		if ('isToggleButton' in $$props) $$invalidate('isToggleButton', isToggleButton = $$props.isToggleButton);
    		if ('classes' in $$props) $$invalidate('classes', classes = $$props.classes);
    		if ('icon' in $$props) $$invalidate('icon', icon = $$props.icon);
    	};

    	$$self.$$.update = ($$dirty = { ripple: 1, disabled: 1, primary: 1, accent: 1, iconOn: 1, iconOff: 1, isToggleButton: 1, value: 1, mdcComponent: 1 }) => {
    		if ($$dirty.ripple) { mdc.ripple = ripple; }
    		if ($$dirty.disabled || $$dirty.primary || $$dirty.accent) { {
            const classList = [];
        
            disabled && classList.push('mdc-icon-toggle--disabled');
            primary && classList.push('mdc-icon-toggle--primary');
            accent && classList.push('mdc-icon-toggle--accent');
        
            $$invalidate('classes', classes = classList.join(' '));
          } }
    		if ($$dirty.iconOn || $$dirty.iconOff) { {
            $$invalidate('isToggleButton', isToggleButton = iconOn && iconOff);
          } }
    		if ($$dirty.isToggleButton || $$dirty.value || $$dirty.iconOn || $$dirty.iconOff || $$dirty.mdcComponent) { {
            if (isToggleButton) {
              $$invalidate('icon', icon = value ? iconOn : iconOff);
            }    
            if (mdcComponent) { mdcComponent.on = value; $$invalidate('mdcComponent', mdcComponent), $$invalidate('isToggleButton', isToggleButton), $$invalidate('value', value), $$invalidate('iconOn', iconOn), $$invalidate('iconOff', iconOff); }
          } }
    	};

    	return {
    		iconButton,
    		ripple,
    		disabled,
    		primary,
    		accent,
    		value,
    		iconOn,
    		iconOff,
    		isToggleButton,
    		classes,
    		icon,
    		onClick,
    		button_binding
    	};
    }

    class IconToggle extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$g, create_fragment$g, safe_not_equal, ["iconButton", "ripple", "disabled", "primary", "accent", "value", "iconOn", "iconOff", "isToggleButton", "classes", "icon", "onClick"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.classes === undefined && !('classes' in props)) {
    			console.warn("<IconToggle> was created without expected prop 'classes'");
    		}
    		if (ctx.icon === undefined && !('icon' in props)) {
    			console.warn("<IconToggle> was created without expected prop 'icon'");
    		}
    		if (ctx.onClick === undefined && !('onClick' in props)) {
    			console.warn("<IconToggle> was created without expected prop 'onClick'");
    		}
    	}

    	get iconButton() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iconButton(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get ripple() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set ripple(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get primary() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set primary(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get accent() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set accent(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iconOn() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iconOn(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iconOff() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iconOff(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isToggleButton() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isToggleButton(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get icon() {
    		throw new Error("<IconToggle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onClick() {
    		return this.$$.ctx.onClick;
    	}

    	set onClick(value) {
    		throw new Error("<IconToggle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
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
    var cssClasses$5 = {
        LIST_ITEM_ACTIVATED_CLASS: 'mdc-list-item--activated',
        LIST_ITEM_CLASS: 'mdc-list-item',
        LIST_ITEM_DISABLED_CLASS: 'mdc-list-item--disabled',
        LIST_ITEM_SELECTED_CLASS: 'mdc-list-item--selected',
        ROOT: 'mdc-list',
    };
    var strings$7 = {
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
        CHILD_ELEMENTS_TO_TOGGLE_TABINDEX: "\n    ." + cssClasses$5.LIST_ITEM_CLASS + " button:not(:disabled),\n    ." + cssClasses$5.LIST_ITEM_CLASS + " a\n  ",
        FOCUSABLE_CHILD_ELEMENTS: "\n    ." + cssClasses$5.LIST_ITEM_CLASS + " button:not(:disabled),\n    ." + cssClasses$5.LIST_ITEM_CLASS + " a,\n    ." + cssClasses$5.LIST_ITEM_CLASS + " input[type=\"radio\"]:not(:disabled),\n    ." + cssClasses$5.LIST_ITEM_CLASS + " input[type=\"checkbox\"]:not(:disabled)\n  ",
        RADIO_SELECTOR: 'input[type="radio"]:not(:disabled)',
    };
    var numbers$3 = {
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
            _this.selectedIndex_ = numbers$3.UNSET_INDEX;
            _this.focusedItemIndex_ = numbers$3.UNSET_INDEX;
            _this.useActivatedClass_ = false;
            _this.ariaCurrentAttrValue_ = null;
            _this.isCheckboxList_ = false;
            _this.isRadioList_ = false;
            return _this;
        }
        Object.defineProperty(MDCListFoundation, "strings", {
            get: function () {
                return strings$7;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCListFoundation, "cssClasses", {
            get: function () {
                return cssClasses$5;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCListFoundation, "numbers", {
            get: function () {
                return numbers$3;
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
            if (index === numbers$3.UNSET_INDEX) {
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
            var selectedClassName = cssClasses$5.LIST_ITEM_SELECTED_CLASS;
            if (this.useActivatedClass_) {
                selectedClassName = cssClasses$5.LIST_ITEM_ACTIVATED_CLASS;
            }
            if (this.selectedIndex_ !== numbers$3.UNSET_INDEX) {
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
            if (this.selectedIndex_ === numbers$3.UNSET_INDEX) {
                this.ariaCurrentAttrValue_ =
                    this.adapter_.getAttributeForElementIndex(index, strings$7.ARIA_CURRENT);
            }
            var isAriaCurrent = this.ariaCurrentAttrValue_ !== null;
            var ariaAttribute = isAriaCurrent ? strings$7.ARIA_CURRENT : strings$7.ARIA_SELECTED;
            if (this.selectedIndex_ !== numbers$3.UNSET_INDEX) {
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
            if (this.selectedIndex_ !== numbers$3.UNSET_INDEX) {
                this.adapter_.setAttributeForElementIndex(this.selectedIndex_, strings$7.ARIA_CHECKED, 'false');
            }
            this.adapter_.setAttributeForElementIndex(index, strings$7.ARIA_CHECKED, 'true');
            this.selectedIndex_ = index;
        };
        MDCListFoundation.prototype.setCheckboxAtIndex_ = function (index) {
            for (var i = 0; i < this.adapter_.getListItemCount(); i++) {
                var isChecked = false;
                if (index.indexOf(i) >= 0) {
                    isChecked = true;
                }
                this.adapter_.setCheckedCheckboxOrRadioAtIndex(i, isChecked);
                this.adapter_.setAttributeForElementIndex(i, strings$7.ARIA_CHECKED, isChecked ? 'true' : 'false');
            }
            this.selectedIndex_ = index;
        };
        MDCListFoundation.prototype.setTabindexAtIndex_ = function (index) {
            if (this.focusedItemIndex_ === numbers$3.UNSET_INDEX && index !== 0) {
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
                if (typeof this.selectedIndex_ === 'number' && this.selectedIndex_ !== numbers$3.UNSET_INDEX) {
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
            this.adapter_.setAttributeForElementIndex(index, strings$7.ARIA_CHECKED, isChecked ? 'true' : 'false');
            // If none of the checkbox items are selected and selectedIndex is not initialized then provide a default value.
            var selectedIndexes = this.selectedIndex_ === numbers$3.UNSET_INDEX ? [] : this.selectedIndex_.slice();
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
                return [].slice.call(this.root_.querySelectorAll("." + cssClasses$5.LIST_ITEM_CLASS));
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
            var direction = this.root_.getAttribute(strings$7.ARIA_ORIENTATION);
            this.vertical = direction !== strings$7.ARIA_ORIENTATION_HORIZONTAL;
            // List items need to have at least tabindex=-1 to be focusable.
            [].slice.call(this.root_.querySelectorAll('.mdc-list-item:not([tabindex])'))
                .forEach(function (el) {
                el.setAttribute('tabindex', '-1');
            });
            // Child button/a elements are not tabbable until the list item is focused.
            [].slice.call(this.root_.querySelectorAll(strings$7.FOCUSABLE_CHILD_ELEMENTS))
                .forEach(function (el) { return el.setAttribute('tabindex', '-1'); });
            this.foundation_.layout();
        };
        /**
         * Initialize selectedIndex value based on pre-selected checkbox list items, single selection or radio.
         */
        MDCList.prototype.initializeListType = function () {
            var _this = this;
            var checkboxListItems = this.root_.querySelectorAll(strings$7.ARIA_ROLE_CHECKBOX_SELECTOR);
            var singleSelectedListItem = this.root_.querySelector("\n      ." + cssClasses$5.LIST_ITEM_ACTIVATED_CLASS + ",\n      ." + cssClasses$5.LIST_ITEM_SELECTED_CLASS + "\n    ");
            var radioSelectedListItem = this.root_.querySelector(strings$7.ARIA_CHECKED_RADIO_SELECTOR);
            if (checkboxListItems.length) {
                var preselectedItems = this.root_.querySelectorAll(strings$7.ARIA_CHECKED_CHECKBOX_SELECTOR);
                this.selectedIndex =
                    [].map.call(preselectedItems, function (listItem) { return _this.listElements.indexOf(listItem); });
            }
            else if (singleSelectedListItem) {
                if (singleSelectedListItem.classList.contains(cssClasses$5.LIST_ITEM_ACTIVATED_CLASS)) {
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
                    return !!listItem.querySelector(strings$7.CHECKBOX_SELECTOR);
                },
                hasRadioAtIndex: function (index) {
                    var listItem = _this.listElements[index];
                    return !!listItem.querySelector(strings$7.RADIO_SELECTOR);
                },
                isCheckboxCheckedAtIndex: function (index) {
                    var listItem = _this.listElements[index];
                    var toggleEl = listItem.querySelector(strings$7.CHECKBOX_SELECTOR);
                    return toggleEl.checked;
                },
                isFocusInsideList: function () {
                    return _this.root_.contains(document.activeElement);
                },
                isRootFocused: function () { return document.activeElement === _this.root_; },
                notifyAction: function (index) {
                    _this.emit(strings$7.ACTION_EVENT, { index: index }, /** shouldBubble */ true);
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
                    var toggleEl = listItem.querySelector(strings$7.CHECKBOX_RADIO_SELECTOR);
                    toggleEl.checked = isChecked;
                    var event = document.createEvent('Event');
                    event.initEvent('change', true, true);
                    toggleEl.dispatchEvent(event);
                },
                setTabIndexForListItemChildren: function (listItemIndex, tabIndexValue) {
                    var element = _this.listElements[listItemIndex];
                    var listItemChildren = [].slice.call(element.querySelectorAll(strings$7.CHILD_ELEMENTS_TO_TOGGLE_TABINDEX));
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
            var nearestParent = closest(eventTarget, "." + cssClasses$5.LIST_ITEM_CLASS + ", ." + cssClasses$5.ROOT);
            // Get the index of the element if it is a list item.
            if (nearestParent && matches(nearestParent, "." + cssClasses$5.LIST_ITEM_CLASS)) {
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
            this.foundation_.handleKeydown(evt, target.classList.contains(cssClasses$5.LIST_ITEM_CLASS), index);
        };
        /**
         * Used to figure out which element was clicked before sending the event to the foundation.
         */
        MDCList.prototype.handleClickEvent_ = function (evt) {
            var index = this.getListItemIndex_(evt);
            var target = evt.target;
            // Toggle the checkbox only if it's not the target of the event, or the checkbox will have 2 change events.
            var toggleCheckbox = !matches(target, strings$7.CHECKBOX_RADIO_SELECTOR);
            this.foundation_.handleClick(index, toggleCheckbox);
        };
        return MDCList;
    }(MDCComponent));

    /* src\components\List\List.svelte generated by Svelte v3.6.1 */

    const file$h = "src\\components\\List\\List.svelte";

    // (52:0) {:else}
    function create_else_block$2(ctx) {
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
    		c: function create() {
    			nav = element("nav");

    			if (default_slot) default_slot.c();

    			set_attributes(nav, nav_data);
    			add_location(nav, file$h, 52, 0, 1413);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(nav_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, nav, anchor);

    			if (default_slot) {
    				default_slot.m(nav, null);
    			}

    			add_binding_callback(() => ctx.nav_binding(nav, null));
    			current = true;
    		},

    		p: function update(changed, ctx) {
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

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(nav);
    			}

    			if (default_slot) default_slot.d(detaching);
    			ctx.nav_binding(null, nav);
    		}
    	};
    }

    // (48:0) {#if as === 'ul'}
    function create_if_block$5(ctx) {
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
    		c: function create() {
    			ul = element("ul");

    			if (default_slot) default_slot.c();

    			set_attributes(ul, ul_data);
    			add_location(ul, file$h, 48, 0, 1350);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(ul_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, ul, anchor);

    			if (default_slot) {
    				default_slot.m(ul, null);
    			}

    			add_binding_callback(() => ctx.ul_binding(ul, null));
    			current = true;
    		},

    		p: function update(changed, ctx) {
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

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(ul);
    			}

    			if (default_slot) default_slot.d(detaching);
    			ctx.ul_binding(null, ul);
    		}
    	};
    }

    function create_fragment$h(ctx) {
    	var current_block_type_index, if_block, if_block_anchor, current;

    	var if_block_creators = [
    		create_if_block$5,
    		create_else_block$2
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.as === 'ul') return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
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

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    function instance$h($$self, $$props, $$invalidate) {
    	
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

    class List extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$h, create_fragment$h, safe_not_equal, ["slots", "attrs", "as", "self", "ripple"]);
    	}

    	get slots() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set slots(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get attrs() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set attrs(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get as() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set as(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get self() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set self(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get ripple() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set ripple(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\List\ListItem.svelte generated by Svelte v3.6.1 */

    const file$i = "src\\components\\List\\ListItem.svelte";

    const get_meta_slot_changes = ({}) => ({});
    const get_meta_slot_context = ({}) => ({});

    const get_graphic_slot_changes = ({}) => ({});
    const get_graphic_slot_context = ({}) => ({});

    // (30:2) {#if showGraphic}
    function create_if_block_3$1(ctx) {
    	var span, current;

    	const graphic_slot_1 = ctx.$$slots.graphic;
    	const graphic_slot = create_slot(graphic_slot_1, ctx, get_graphic_slot_context);

    	return {
    		c: function create() {
    			span = element("span");

    			if (graphic_slot) graphic_slot.c();

    			attr(span, "role", "presentation");
    			attr(span, "class", "mdc-list-item__graphic");
    			add_location(span, file$i, 30, 2, 784);
    		},

    		l: function claim(nodes) {
    			if (graphic_slot) graphic_slot.l(span_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);

    			if (graphic_slot) {
    				graphic_slot.m(span, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (graphic_slot && graphic_slot.p && changed.$$scope) {
    				graphic_slot.p(get_slot_changes(graphic_slot_1, ctx, changed, get_graphic_slot_changes), get_slot_context(graphic_slot_1, ctx, get_graphic_slot_context));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(graphic_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(graphic_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			if (graphic_slot) graphic_slot.d(detaching);
    		}
    	};
    }

    // (42:2) {:else}
    function create_else_block$3(ctx) {
    	var current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},

    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (34:8) {#if primaryText}
    function create_if_block_1$2(ctx) {
    	var span, t0, t1;

    	var if_block = (ctx.secondText) && create_if_block_2$2(ctx);

    	return {
    		c: function create() {
    			span = element("span");
    			t0 = text(ctx.primaryText);
    			t1 = space();
    			if (if_block) if_block.c();
    			attr(span, "class", "mdc-list-item__text");
    			add_location(span, file$i, 34, 2, 913);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			append(span, t1);
    			if (if_block) if_block.m(span, null);
    		},

    		p: function update(changed, ctx) {
    			if (changed.primaryText) {
    				set_data(t0, ctx.primaryText);
    			}

    			if (ctx.secondText) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_2$2(ctx);
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

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			if (if_block) if_block.d();
    		}
    	};
    }

    // (36:18) {#if secondText}
    function create_if_block_2$2(ctx) {
    	var span, t;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(ctx.secondText);
    			attr(span, "class", "mdc-list-item__secondary-text");
    			add_location(span, file$i, 36, 4, 987);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.secondText) {
    				set_data(t, ctx.secondText);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (44:8) {#if showMeta}
    function create_if_block$6(ctx) {
    	var span, current;

    	const meta_slot_1 = ctx.$$slots.meta;
    	const meta_slot = create_slot(meta_slot_1, ctx, get_meta_slot_context);

    	return {
    		c: function create() {
    			span = element("span");

    			if (meta_slot) meta_slot.c();

    			attr(span, "role", "presentation");
    			attr(span, "class", "mdc-list-item__meta");
    			add_location(span, file$i, 44, 2, 1134);
    		},

    		l: function claim(nodes) {
    			if (meta_slot) meta_slot.l(span_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);

    			if (meta_slot) {
    				meta_slot.m(span, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (meta_slot && meta_slot.p && changed.$$scope) {
    				meta_slot.p(get_slot_changes(meta_slot_1, ctx, changed, get_meta_slot_changes), get_slot_context(meta_slot_1, ctx, get_meta_slot_context));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(meta_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(meta_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			if (meta_slot) meta_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$i(ctx) {
    	var li, t0, current_block_type_index, if_block1, t1, current;

    	var if_block0 = (ctx.showGraphic) && create_if_block_3$1(ctx);

    	var if_block_creators = [
    		create_if_block_1$2,
    		create_else_block$3
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.primaryText) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	var if_block2 = (ctx.showMeta) && create_if_block$6(ctx);

    	var li_levels = [
    		ctx.attrs
    	];

    	var li_data = {};
    	for (var i = 0; i < li_levels.length; i += 1) {
    		li_data = assign(li_data, li_levels[i]);
    	}

    	return {
    		c: function create() {
    			li = element("li");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			set_attributes(li, li_data);
    			add_location(li, file$i, 28, 0, 746);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, li, anchor);
    			if (if_block0) if_block0.m(li, null);
    			append(li, t0);
    			if_blocks[current_block_type_index].m(li, null);
    			append(li, t1);
    			if (if_block2) if_block2.m(li, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (ctx.showGraphic) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_3$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(li, t0);
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
    				if_block1.m(li, t1);
    			}

    			if (ctx.showMeta) {
    				if (if_block2) {
    					if_block2.p(changed, ctx);
    					transition_in(if_block2, 1);
    				} else {
    					if_block2 = create_if_block$6(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(li, null);
    				}
    			} else if (if_block2) {
    				group_outros();
    				transition_out(if_block2, 1, () => {
    					if_block2 = null;
    				});
    				check_outros();
    			}

    			set_attributes(li, get_spread_update(li_levels, [
    				(changed.attrs) && ctx.attrs
    			]));
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(li);
    			}

    			if (if_block0) if_block0.d();
    			if_blocks[current_block_type_index].d();
    			if (if_block2) if_block2.d();
    		}
    	};
    }

    function instance$i($$self, $$props, $$invalidate) {
    	let { showGraphic = false, primaryText, secondText, showMeta = false, attrs } = $$props;

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

    class ListItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$i, create_fragment$i, safe_not_equal, ["showGraphic", "primaryText", "secondText", "showMeta", "attrs"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.primaryText === undefined && !('primaryText' in props)) {
    			console.warn("<ListItem> was created without expected prop 'primaryText'");
    		}
    		if (ctx.secondText === undefined && !('secondText' in props)) {
    			console.warn("<ListItem> was created without expected prop 'secondText'");
    		}
    		if (ctx.attrs === undefined && !('attrs' in props)) {
    			console.warn("<ListItem> was created without expected prop 'attrs'");
    		}
    	}

    	get showGraphic() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showGraphic(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get primaryText() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set primaryText(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get secondText() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set secondText(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showMeta() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showMeta(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get attrs() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set attrs(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Tab\Tab.svelte generated by Svelte v3.6.1 */

    const file$j = "src\\components\\Tab\\Tab.svelte";

    // (30:10) {:else}
    function create_else_block$4(ctx) {
    	var current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},

    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (26:4) {#if icon}
    function create_if_block_2$3(ctx) {
    	var span, t0, t1, if_block_anchor, current;

    	var if_block = (!ctx.iconOnly) && create_if_block_3$2(ctx);

    	return {
    		c: function create() {
    			span = element("span");
    			t0 = text(ctx.icon);
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr(span, "class", "mdc-tab__icon material-icons");
    			attr(span, "aria-hidden", "true");
    			add_location(span, file$j, 26, 4, 580);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			insert(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (!current || changed.icon) {
    				set_data(t0, ctx.icon);
    			}

    			if (!ctx.iconOnly) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block_3$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();
    				transition_out(if_block, 1, () => {
    					if_block = null;
    				});
    				check_outros();
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    				detach(t1);
    			}

    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    // (28:4) {#if !iconOnly}
    function create_if_block_3$2(ctx) {
    	var span, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			span = element("span");

    			if (default_slot) default_slot.c();

    			attr(span, "class", "mdc-tab__text-label");
    			add_location(span, file$j, 28, 4, 680);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(span_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);

    			if (default_slot) {
    				default_slot.m(span, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (33:4) {#if spanningOnlyContent}
    function create_if_block_1$3(ctx) {
    	var span1, span0;

    	return {
    		c: function create() {
    			span1 = element("span");
    			span0 = element("span");
    			attr(span0, "class", "mdc-tab-indicator__content mdc-tab-indicator__content--underline");
    			add_location(span0, file$j, 34, 6, 854);
    			attr(span1, "class", "mdc-tab-indicator");
    			add_location(span1, file$j, 33, 4, 815);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span1, anchor);
    			append(span1, span0);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span1);
    			}
    		}
    	};
    }

    // (39:2) {#if !spanningOnlyContent}
    function create_if_block$7(ctx) {
    	var span1, span0;

    	return {
    		c: function create() {
    			span1 = element("span");
    			span0 = element("span");
    			attr(span0, "class", "mdc-tab-indicator__content mdc-tab-indicator__content--underline");
    			add_location(span0, file$j, 40, 4, 1082);
    			attr(span1, "class", "mdc-tab-indicator");
    			toggle_class(span1, "mdc-tab-indicator--active", ctx.active);
    			add_location(span1, file$j, 39, 2, 1004);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span1, anchor);
    			append(span1, span0);
    		},

    		p: function update(changed, ctx) {
    			if (changed.active) {
    				toggle_class(span1, "mdc-tab-indicator--active", ctx.active);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span1);
    			}
    		}
    	};
    }

    function create_fragment$j(ctx) {
    	var a, span0, current_block_type_index, if_block0, t0, t1, t2, span1, current;

    	var if_block_creators = [
    		create_if_block_2$3,
    		create_else_block$4
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.icon) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	var if_block1 = (ctx.spanningOnlyContent) && create_if_block_1$3();

    	var if_block2 = (!ctx.spanningOnlyContent) && create_if_block$7(ctx);

    	return {
    		c: function create() {
    			a = element("a");
    			span0 = element("span");
    			if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			span1 = element("span");
    			attr(span0, "class", "mdc-tab__content");
    			add_location(span0, file$j, 24, 2, 529);
    			attr(span1, "class", "mdc-tab__ripple");
    			add_location(span1, file$j, 43, 2, 1189);
    			attr(a, "class", "mdc-tab");
    			attr(a, "role", "tab");
    			attr(a, "aria-selected", ctx.active);
    			attr(a, "href", ctx.href);
    			toggle_class(a, "mdc-tab--active", ctx.active);
    			toggle_class(a, "mdc-tab--stacked", ctx.stacked);
    			toggle_class(a, "mdc-tab--minWidth", ctx.minWidth);
    			add_location(a, file$j, 14, 0, 322);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, a, anchor);
    			append(a, span0);
    			if_blocks[current_block_type_index].m(span0, null);
    			append(span0, t0);
    			if (if_block1) if_block1.m(span0, null);
    			append(a, t1);
    			if (if_block2) if_block2.m(a, null);
    			append(a, t2);
    			append(a, span1);
    			add_binding_callback(() => ctx.a_binding(a, null));
    			current = true;
    		},

    		p: function update(changed, ctx) {
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

    				if_block0 = if_blocks[current_block_type_index];
    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				}
    				transition_in(if_block0, 1);
    				if_block0.m(span0, t0);
    			}

    			if (ctx.spanningOnlyContent) {
    				if (!if_block1) {
    					if_block1 = create_if_block_1$3();
    					if_block1.c();
    					if_block1.m(span0, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (!ctx.spanningOnlyContent) {
    				if (if_block2) {
    					if_block2.p(changed, ctx);
    				} else {
    					if_block2 = create_if_block$7(ctx);
    					if_block2.c();
    					if_block2.m(a, t2);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (changed.items) {
    				ctx.a_binding(null, a);
    				ctx.a_binding(a, null);
    			}

    			if (!current || changed.active) {
    				attr(a, "aria-selected", ctx.active);
    			}

    			if (!current || changed.href) {
    				attr(a, "href", ctx.href);
    			}

    			if (changed.active) {
    				toggle_class(a, "mdc-tab--active", ctx.active);
    			}

    			if (changed.stacked) {
    				toggle_class(a, "mdc-tab--stacked", ctx.stacked);
    			}

    			if (changed.minWidth) {
    				toggle_class(a, "mdc-tab--minWidth", ctx.minWidth);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block0);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(a);
    			}

    			if_blocks[current_block_type_index].d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			ctx.a_binding(null, a);
    		}
    	};
    }

    function instance$j($$self, $$props, $$invalidate) {
    	let { tab = null, icon = '', active = false, iconOnly = false, href='', ripple = false, focusOnActivate = false, spanningOnlyContent = false, stacked = false, minWidth = false } = $$props;

    	const writable_props = ['tab', 'icon', 'active', 'iconOnly', 'href', 'ripple', 'focusOnActivate', 'spanningOnlyContent', 'stacked', 'minWidth'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Tab> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function a_binding($$node, check) {
    		tab = $$node;
    		$$invalidate('tab', tab);
    	}

    	$$self.$set = $$props => {
    		if ('tab' in $$props) $$invalidate('tab', tab = $$props.tab);
    		if ('icon' in $$props) $$invalidate('icon', icon = $$props.icon);
    		if ('active' in $$props) $$invalidate('active', active = $$props.active);
    		if ('iconOnly' in $$props) $$invalidate('iconOnly', iconOnly = $$props.iconOnly);
    		if ('href' in $$props) $$invalidate('href', href = $$props.href);
    		if ('ripple' in $$props) $$invalidate('ripple', ripple = $$props.ripple);
    		if ('focusOnActivate' in $$props) $$invalidate('focusOnActivate', focusOnActivate = $$props.focusOnActivate);
    		if ('spanningOnlyContent' in $$props) $$invalidate('spanningOnlyContent', spanningOnlyContent = $$props.spanningOnlyContent);
    		if ('stacked' in $$props) $$invalidate('stacked', stacked = $$props.stacked);
    		if ('minWidth' in $$props) $$invalidate('minWidth', minWidth = $$props.minWidth);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	return {
    		tab,
    		icon,
    		active,
    		iconOnly,
    		href,
    		ripple,
    		focusOnActivate,
    		spanningOnlyContent,
    		stacked,
    		minWidth,
    		a_binding,
    		$$slots,
    		$$scope
    	};
    }

    class Tab extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$j, create_fragment$j, safe_not_equal, ["tab", "icon", "active", "iconOnly", "href", "ripple", "focusOnActivate", "spanningOnlyContent", "stacked", "minWidth"]);
    	}

    	get tab() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set tab(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get icon() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get active() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set active(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iconOnly() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iconOnly(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get href() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set href(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get ripple() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set ripple(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusOnActivate() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusOnActivate(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get spanningOnlyContent() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set spanningOnlyContent(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stacked() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stacked(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get minWidth() {
    		throw new Error("<Tab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set minWidth(value) {
    		throw new Error("<Tab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
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
    var cssClasses$6 = {
        ANIMATING: 'mdc-tab-scroller--animating',
        SCROLL_AREA_SCROLL: 'mdc-tab-scroller__scroll-area--scroll',
        SCROLL_TEST: 'mdc-tab-scroller__test',
    };
    var strings$8 = {
        AREA_SELECTOR: '.mdc-tab-scroller__scroll-area',
        CONTENT_SELECTOR: '.mdc-tab-scroller__scroll-content',
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
    var MDCTabScrollerRTL = /** @class */ (function () {
        function MDCTabScrollerRTL(adapter) {
            this.adapter_ = adapter;
        }
        return MDCTabScrollerRTL;
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
    var MDCTabScrollerRTLDefault = /** @class */ (function (_super) {
        __extends(MDCTabScrollerRTLDefault, _super);
        function MDCTabScrollerRTLDefault() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTabScrollerRTLDefault.prototype.getScrollPositionRTL = function () {
            var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            var right = this.calculateScrollEdges_().right;
            // Scroll values on most browsers are ints instead of floats so we round
            return Math.round(right - currentScrollLeft);
        };
        MDCTabScrollerRTLDefault.prototype.scrollToRTL = function (scrollX) {
            var edges = this.calculateScrollEdges_();
            var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            var clampedScrollLeft = this.clampScrollValue_(edges.right - scrollX);
            return {
                finalScrollPosition: clampedScrollLeft,
                scrollDelta: clampedScrollLeft - currentScrollLeft,
            };
        };
        MDCTabScrollerRTLDefault.prototype.incrementScrollRTL = function (scrollX) {
            var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            var clampedScrollLeft = this.clampScrollValue_(currentScrollLeft - scrollX);
            return {
                finalScrollPosition: clampedScrollLeft,
                scrollDelta: clampedScrollLeft - currentScrollLeft,
            };
        };
        MDCTabScrollerRTLDefault.prototype.getAnimatingScrollPosition = function (scrollX) {
            return scrollX;
        };
        MDCTabScrollerRTLDefault.prototype.calculateScrollEdges_ = function () {
            var contentWidth = this.adapter_.getScrollContentOffsetWidth();
            var rootWidth = this.adapter_.getScrollAreaOffsetWidth();
            return {
                left: 0,
                right: contentWidth - rootWidth,
            };
        };
        MDCTabScrollerRTLDefault.prototype.clampScrollValue_ = function (scrollX) {
            var edges = this.calculateScrollEdges_();
            return Math.min(Math.max(edges.left, scrollX), edges.right);
        };
        return MDCTabScrollerRTLDefault;
    }(MDCTabScrollerRTL));

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
    var MDCTabScrollerRTLNegative = /** @class */ (function (_super) {
        __extends(MDCTabScrollerRTLNegative, _super);
        function MDCTabScrollerRTLNegative() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTabScrollerRTLNegative.prototype.getScrollPositionRTL = function (translateX) {
            var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            return Math.round(translateX - currentScrollLeft);
        };
        MDCTabScrollerRTLNegative.prototype.scrollToRTL = function (scrollX) {
            var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            var clampedScrollLeft = this.clampScrollValue_(-scrollX);
            return {
                finalScrollPosition: clampedScrollLeft,
                scrollDelta: clampedScrollLeft - currentScrollLeft,
            };
        };
        MDCTabScrollerRTLNegative.prototype.incrementScrollRTL = function (scrollX) {
            var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            var clampedScrollLeft = this.clampScrollValue_(currentScrollLeft - scrollX);
            return {
                finalScrollPosition: clampedScrollLeft,
                scrollDelta: clampedScrollLeft - currentScrollLeft,
            };
        };
        MDCTabScrollerRTLNegative.prototype.getAnimatingScrollPosition = function (scrollX, translateX) {
            return scrollX - translateX;
        };
        MDCTabScrollerRTLNegative.prototype.calculateScrollEdges_ = function () {
            var contentWidth = this.adapter_.getScrollContentOffsetWidth();
            var rootWidth = this.adapter_.getScrollAreaOffsetWidth();
            return {
                left: rootWidth - contentWidth,
                right: 0,
            };
        };
        MDCTabScrollerRTLNegative.prototype.clampScrollValue_ = function (scrollX) {
            var edges = this.calculateScrollEdges_();
            return Math.max(Math.min(edges.right, scrollX), edges.left);
        };
        return MDCTabScrollerRTLNegative;
    }(MDCTabScrollerRTL));

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
    var MDCTabScrollerRTLReverse = /** @class */ (function (_super) {
        __extends(MDCTabScrollerRTLReverse, _super);
        function MDCTabScrollerRTLReverse() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTabScrollerRTLReverse.prototype.getScrollPositionRTL = function (translateX) {
            var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            // Scroll values on most browsers are ints instead of floats so we round
            return Math.round(currentScrollLeft - translateX);
        };
        MDCTabScrollerRTLReverse.prototype.scrollToRTL = function (scrollX) {
            var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            var clampedScrollLeft = this.clampScrollValue_(scrollX);
            return {
                finalScrollPosition: clampedScrollLeft,
                scrollDelta: currentScrollLeft - clampedScrollLeft,
            };
        };
        MDCTabScrollerRTLReverse.prototype.incrementScrollRTL = function (scrollX) {
            var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            var clampedScrollLeft = this.clampScrollValue_(currentScrollLeft + scrollX);
            return {
                finalScrollPosition: clampedScrollLeft,
                scrollDelta: currentScrollLeft - clampedScrollLeft,
            };
        };
        MDCTabScrollerRTLReverse.prototype.getAnimatingScrollPosition = function (scrollX, translateX) {
            return scrollX + translateX;
        };
        MDCTabScrollerRTLReverse.prototype.calculateScrollEdges_ = function () {
            var contentWidth = this.adapter_.getScrollContentOffsetWidth();
            var rootWidth = this.adapter_.getScrollAreaOffsetWidth();
            return {
                left: contentWidth - rootWidth,
                right: 0,
            };
        };
        MDCTabScrollerRTLReverse.prototype.clampScrollValue_ = function (scrollX) {
            var edges = this.calculateScrollEdges_();
            return Math.min(Math.max(edges.right, scrollX), edges.left);
        };
        return MDCTabScrollerRTLReverse;
    }(MDCTabScrollerRTL));

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
    var MDCTabScrollerFoundation = /** @class */ (function (_super) {
        __extends(MDCTabScrollerFoundation, _super);
        function MDCTabScrollerFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCTabScrollerFoundation.defaultAdapter, adapter)) || this;
            /**
             * Controls whether we should handle the transitionend and interaction events during the animation.
             */
            _this.isAnimating_ = false;
            return _this;
        }
        Object.defineProperty(MDCTabScrollerFoundation, "cssClasses", {
            get: function () {
                return cssClasses$6;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTabScrollerFoundation, "strings", {
            get: function () {
                return strings$8;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTabScrollerFoundation, "defaultAdapter", {
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    eventTargetMatchesSelector: function () { return false; },
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    addScrollAreaClass: function () { return undefined; },
                    setScrollAreaStyleProperty: function () { return undefined; },
                    setScrollContentStyleProperty: function () { return undefined; },
                    getScrollContentStyleValue: function () { return ''; },
                    setScrollAreaScrollLeft: function () { return undefined; },
                    getScrollAreaScrollLeft: function () { return 0; },
                    getScrollContentOffsetWidth: function () { return 0; },
                    getScrollAreaOffsetWidth: function () { return 0; },
                    computeScrollAreaClientRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                    computeScrollContentClientRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                    computeHorizontalScrollbarHeight: function () { return 0; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCTabScrollerFoundation.prototype.init = function () {
            // Compute horizontal scrollbar height on scroller with overflow initially hidden, then update overflow to scroll
            // and immediately adjust bottom margin to avoid the scrollbar initially appearing before JS runs.
            var horizontalScrollbarHeight = this.adapter_.computeHorizontalScrollbarHeight();
            this.adapter_.setScrollAreaStyleProperty('margin-bottom', -horizontalScrollbarHeight + 'px');
            this.adapter_.addScrollAreaClass(MDCTabScrollerFoundation.cssClasses.SCROLL_AREA_SCROLL);
        };
        /**
         * Computes the current visual scroll position
         */
        MDCTabScrollerFoundation.prototype.getScrollPosition = function () {
            if (this.isRTL_()) {
                return this.computeCurrentScrollPositionRTL_();
            }
            var currentTranslateX = this.calculateCurrentTranslateX_();
            var scrollLeft = this.adapter_.getScrollAreaScrollLeft();
            return scrollLeft - currentTranslateX;
        };
        /**
         * Handles interaction events that occur during transition
         */
        MDCTabScrollerFoundation.prototype.handleInteraction = function () {
            // Early exit if we aren't animating
            if (!this.isAnimating_) {
                return;
            }
            // Prevent other event listeners from handling this event
            this.stopScrollAnimation_();
        };
        /**
         * Handles the transitionend event
         */
        MDCTabScrollerFoundation.prototype.handleTransitionEnd = function (evt) {
            // Early exit if we aren't animating or the event was triggered by a different element.
            var evtTarget = evt.target;
            if (!this.isAnimating_ ||
                !this.adapter_.eventTargetMatchesSelector(evtTarget, MDCTabScrollerFoundation.strings.CONTENT_SELECTOR)) {
                return;
            }
            this.isAnimating_ = false;
            this.adapter_.removeClass(MDCTabScrollerFoundation.cssClasses.ANIMATING);
        };
        /**
         * Increment the scroll value by the scrollXIncrement
         * @param scrollXIncrement The value by which to increment the scroll position
         */
        MDCTabScrollerFoundation.prototype.incrementScroll = function (scrollXIncrement) {
            // Early exit for non-operational increment values
            if (scrollXIncrement === 0) {
                return;
            }
            if (this.isRTL_()) {
                return this.incrementScrollRTL_(scrollXIncrement);
            }
            this.incrementScroll_(scrollXIncrement);
        };
        /**
         * Scrolls to the given scrollX value
         */
        MDCTabScrollerFoundation.prototype.scrollTo = function (scrollX) {
            if (this.isRTL_()) {
                return this.scrollToRTL_(scrollX);
            }
            this.scrollTo_(scrollX);
        };
        /**
         * @return Browser-specific {@link MDCTabScrollerRTL} instance.
         */
        MDCTabScrollerFoundation.prototype.getRTLScroller = function () {
            if (!this.rtlScrollerInstance_) {
                this.rtlScrollerInstance_ = this.rtlScrollerFactory_();
            }
            return this.rtlScrollerInstance_;
        };
        /**
         * @return translateX value from a CSS matrix transform function string.
         */
        MDCTabScrollerFoundation.prototype.calculateCurrentTranslateX_ = function () {
            var transformValue = this.adapter_.getScrollContentStyleValue('transform');
            // Early exit if no transform is present
            if (transformValue === 'none') {
                return 0;
            }
            // The transform value comes back as a matrix transformation in the form
            // of `matrix(a, b, c, d, tx, ty)`. We only care about tx (translateX) so
            // we're going to grab all the parenthesized values, strip out tx, and
            // parse it.
            var match = /\((.+?)\)/.exec(transformValue);
            if (!match) {
                return 0;
            }
            var matrixParams = match[1];
            // tslint:disable-next-line:ban-ts-ignore "Unused vars" should be a linter warning, not a compiler error.
            // @ts-ignore These unused variables should retain their semantic names for clarity.
            var _a = __read(matrixParams.split(','), 6), a = _a[0], b = _a[1], c = _a[2], d = _a[3], tx = _a[4], ty = _a[5];
            return parseFloat(tx); // tslint:disable-line:ban
        };
        /**
         * Calculates a safe scroll value that is > 0 and < the max scroll value
         * @param scrollX The distance to scroll
         */
        MDCTabScrollerFoundation.prototype.clampScrollValue_ = function (scrollX) {
            var edges = this.calculateScrollEdges_();
            return Math.min(Math.max(edges.left, scrollX), edges.right);
        };
        MDCTabScrollerFoundation.prototype.computeCurrentScrollPositionRTL_ = function () {
            var translateX = this.calculateCurrentTranslateX_();
            return this.getRTLScroller().getScrollPositionRTL(translateX);
        };
        MDCTabScrollerFoundation.prototype.calculateScrollEdges_ = function () {
            var contentWidth = this.adapter_.getScrollContentOffsetWidth();
            var rootWidth = this.adapter_.getScrollAreaOffsetWidth();
            return {
                left: 0,
                right: contentWidth - rootWidth,
            };
        };
        /**
         * Internal scroll method
         * @param scrollX The new scroll position
         */
        MDCTabScrollerFoundation.prototype.scrollTo_ = function (scrollX) {
            var currentScrollX = this.getScrollPosition();
            var safeScrollX = this.clampScrollValue_(scrollX);
            var scrollDelta = safeScrollX - currentScrollX;
            this.animate_({
                finalScrollPosition: safeScrollX,
                scrollDelta: scrollDelta,
            });
        };
        /**
         * Internal RTL scroll method
         * @param scrollX The new scroll position
         */
        MDCTabScrollerFoundation.prototype.scrollToRTL_ = function (scrollX) {
            var animation = this.getRTLScroller().scrollToRTL(scrollX);
            this.animate_(animation);
        };
        /**
         * Internal increment scroll method
         * @param scrollX The new scroll position increment
         */
        MDCTabScrollerFoundation.prototype.incrementScroll_ = function (scrollX) {
            var currentScrollX = this.getScrollPosition();
            var targetScrollX = scrollX + currentScrollX;
            var safeScrollX = this.clampScrollValue_(targetScrollX);
            var scrollDelta = safeScrollX - currentScrollX;
            this.animate_({
                finalScrollPosition: safeScrollX,
                scrollDelta: scrollDelta,
            });
        };
        /**
         * Internal increment scroll RTL method
         * @param scrollX The new scroll position RTL increment
         */
        MDCTabScrollerFoundation.prototype.incrementScrollRTL_ = function (scrollX) {
            var animation = this.getRTLScroller().incrementScrollRTL(scrollX);
            this.animate_(animation);
        };
        /**
         * Animates the tab scrolling
         * @param animation The animation to apply
         */
        MDCTabScrollerFoundation.prototype.animate_ = function (animation) {
            var _this = this;
            // Early exit if translateX is 0, which means there's no animation to perform
            if (animation.scrollDelta === 0) {
                return;
            }
            this.stopScrollAnimation_();
            // This animation uses the FLIP approach.
            // Read more here: https://aerotwist.com/blog/flip-your-animations/
            this.adapter_.setScrollAreaScrollLeft(animation.finalScrollPosition);
            this.adapter_.setScrollContentStyleProperty('transform', "translateX(" + animation.scrollDelta + "px)");
            // Force repaint
            this.adapter_.computeScrollAreaClientRect();
            requestAnimationFrame(function () {
                _this.adapter_.addClass(MDCTabScrollerFoundation.cssClasses.ANIMATING);
                _this.adapter_.setScrollContentStyleProperty('transform', 'none');
            });
            this.isAnimating_ = true;
        };
        /**
         * Stops scroll animation
         */
        MDCTabScrollerFoundation.prototype.stopScrollAnimation_ = function () {
            this.isAnimating_ = false;
            var currentScrollPosition = this.getAnimatingScrollPosition_();
            this.adapter_.removeClass(MDCTabScrollerFoundation.cssClasses.ANIMATING);
            this.adapter_.setScrollContentStyleProperty('transform', 'translateX(0px)');
            this.adapter_.setScrollAreaScrollLeft(currentScrollPosition);
        };
        /**
         * Gets the current scroll position during animation
         */
        MDCTabScrollerFoundation.prototype.getAnimatingScrollPosition_ = function () {
            var currentTranslateX = this.calculateCurrentTranslateX_();
            var scrollLeft = this.adapter_.getScrollAreaScrollLeft();
            if (this.isRTL_()) {
                return this.getRTLScroller().getAnimatingScrollPosition(scrollLeft, currentTranslateX);
            }
            return scrollLeft - currentTranslateX;
        };
        /**
         * Determines the RTL Scroller to use
         */
        MDCTabScrollerFoundation.prototype.rtlScrollerFactory_ = function () {
            // Browsers have three different implementations of scrollLeft in RTL mode,
            // dependent on the browser. The behavior is based off the max LTR
            // scrollLeft value and 0.
            //
            // * Default scrolling in RTL *
            //    - Left-most value: 0
            //    - Right-most value: Max LTR scrollLeft value
            //
            // * Negative scrolling in RTL *
            //    - Left-most value: Negated max LTR scrollLeft value
            //    - Right-most value: 0
            //
            // * Reverse scrolling in RTL *
            //    - Left-most value: Max LTR scrollLeft value
            //    - Right-most value: 0
            //
            // We use those principles below to determine which RTL scrollLeft
            // behavior is implemented in the current browser.
            var initialScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            this.adapter_.setScrollAreaScrollLeft(initialScrollLeft - 1);
            var newScrollLeft = this.adapter_.getScrollAreaScrollLeft();
            // If the newScrollLeft value is negative,then we know that the browser has
            // implemented negative RTL scrolling, since all other implementations have
            // only positive values.
            if (newScrollLeft < 0) {
                // Undo the scrollLeft test check
                this.adapter_.setScrollAreaScrollLeft(initialScrollLeft);
                return new MDCTabScrollerRTLNegative(this.adapter_);
            }
            var rootClientRect = this.adapter_.computeScrollAreaClientRect();
            var contentClientRect = this.adapter_.computeScrollContentClientRect();
            var rightEdgeDelta = Math.round(contentClientRect.right - rootClientRect.right);
            // Undo the scrollLeft test check
            this.adapter_.setScrollAreaScrollLeft(initialScrollLeft);
            // By calculating the clientRect of the root element and the clientRect of
            // the content element, we can determine how much the scroll value changed
            // when we performed the scrollLeft subtraction above.
            if (rightEdgeDelta === newScrollLeft) {
                return new MDCTabScrollerRTLReverse(this.adapter_);
            }
            return new MDCTabScrollerRTLDefault(this.adapter_);
        };
        MDCTabScrollerFoundation.prototype.isRTL_ = function () {
            return this.adapter_.getScrollContentStyleValue('direction') === 'rtl';
        };
        return MDCTabScrollerFoundation;
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
    /**
     * Stores result from computeHorizontalScrollbarHeight to avoid redundant processing.
     */
    var horizontalScrollbarHeight_;
    /**
     * Computes the height of browser-rendered horizontal scrollbars using a self-created test element.
     * May return 0 (e.g. on OS X browsers under default configuration).
     */
    function computeHorizontalScrollbarHeight(documentObj, shouldCacheResult) {
        if (shouldCacheResult === void 0) { shouldCacheResult = true; }
        if (shouldCacheResult && typeof horizontalScrollbarHeight_ !== 'undefined') {
            return horizontalScrollbarHeight_;
        }
        var el = documentObj.createElement('div');
        el.classList.add(cssClasses$6.SCROLL_TEST);
        documentObj.body.appendChild(el);
        var horizontalScrollbarHeight = el.offsetHeight - el.clientHeight;
        documentObj.body.removeChild(el);
        if (shouldCacheResult) {
            horizontalScrollbarHeight_ = horizontalScrollbarHeight;
        }
        return horizontalScrollbarHeight;
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
    var MDCTabScroller = /** @class */ (function (_super) {
        __extends(MDCTabScroller, _super);
        function MDCTabScroller() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTabScroller.attachTo = function (root) {
            return new MDCTabScroller(root);
        };
        MDCTabScroller.prototype.initialize = function () {
            this.area_ = this.root_.querySelector(MDCTabScrollerFoundation.strings.AREA_SELECTOR);
            this.content_ = this.root_.querySelector(MDCTabScrollerFoundation.strings.CONTENT_SELECTOR);
        };
        MDCTabScroller.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.handleInteraction_ = function () { return _this.foundation_.handleInteraction(); };
            this.handleTransitionEnd_ = function (evt) { return _this.foundation_.handleTransitionEnd(evt); };
            this.area_.addEventListener('wheel', this.handleInteraction_);
            this.area_.addEventListener('touchstart', this.handleInteraction_);
            this.area_.addEventListener('pointerdown', this.handleInteraction_);
            this.area_.addEventListener('mousedown', this.handleInteraction_);
            this.area_.addEventListener('keydown', this.handleInteraction_);
            this.content_.addEventListener('transitionend', this.handleTransitionEnd_);
        };
        MDCTabScroller.prototype.destroy = function () {
            _super.prototype.destroy.call(this);
            this.area_.removeEventListener('wheel', this.handleInteraction_);
            this.area_.removeEventListener('touchstart', this.handleInteraction_);
            this.area_.removeEventListener('pointerdown', this.handleInteraction_);
            this.area_.removeEventListener('mousedown', this.handleInteraction_);
            this.area_.removeEventListener('keydown', this.handleInteraction_);
            this.content_.removeEventListener('transitionend', this.handleTransitionEnd_);
        };
        MDCTabScroller.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                eventTargetMatchesSelector: function (evtTarget, selector) { return matches(evtTarget, selector); },
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                addScrollAreaClass: function (className) { return _this.area_.classList.add(className); },
                setScrollAreaStyleProperty: function (prop, value) { return _this.area_.style.setProperty(prop, value); },
                setScrollContentStyleProperty: function (prop, value) { return _this.content_.style.setProperty(prop, value); },
                getScrollContentStyleValue: function (propName) { return window.getComputedStyle(_this.content_).getPropertyValue(propName); },
                setScrollAreaScrollLeft: function (scrollX) { return _this.area_.scrollLeft = scrollX; },
                getScrollAreaScrollLeft: function () { return _this.area_.scrollLeft; },
                getScrollContentOffsetWidth: function () { return _this.content_.offsetWidth; },
                getScrollAreaOffsetWidth: function () { return _this.area_.offsetWidth; },
                computeScrollAreaClientRect: function () { return _this.area_.getBoundingClientRect(); },
                computeScrollContentClientRect: function () { return _this.content_.getBoundingClientRect(); },
                computeHorizontalScrollbarHeight: function () { return computeHorizontalScrollbarHeight(document); },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCTabScrollerFoundation(adapter);
        };
        /**
         * Returns the current visual scroll position
         */
        MDCTabScroller.prototype.getScrollPosition = function () {
            return this.foundation_.getScrollPosition();
        };
        /**
         * Returns the width of the scroll content
         */
        MDCTabScroller.prototype.getScrollContentWidth = function () {
            return this.content_.offsetWidth;
        };
        /**
         * Increments the scroll value by the given amount
         * @param scrollXIncrement The pixel value by which to increment the scroll value
         */
        MDCTabScroller.prototype.incrementScroll = function (scrollXIncrement) {
            this.foundation_.incrementScroll(scrollXIncrement);
        };
        /**
         * Scrolls to the given pixel position
         * @param scrollX The pixel value to scroll to
         */
        MDCTabScroller.prototype.scrollTo = function (scrollX) {
            this.foundation_.scrollTo(scrollX);
        };
        return MDCTabScroller;
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
    var cssClasses$7 = {
        ACTIVE: 'mdc-tab-indicator--active',
        FADE: 'mdc-tab-indicator--fade',
        NO_TRANSITION: 'mdc-tab-indicator--no-transition',
    };
    var strings$9 = {
        CONTENT_SELECTOR: '.mdc-tab-indicator__content',
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
    var MDCTabIndicatorFoundation = /** @class */ (function (_super) {
        __extends(MDCTabIndicatorFoundation, _super);
        function MDCTabIndicatorFoundation(adapter) {
            return _super.call(this, __assign({}, MDCTabIndicatorFoundation.defaultAdapter, adapter)) || this;
        }
        Object.defineProperty(MDCTabIndicatorFoundation, "cssClasses", {
            get: function () {
                return cssClasses$7;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTabIndicatorFoundation, "strings", {
            get: function () {
                return strings$9;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTabIndicatorFoundation, "defaultAdapter", {
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    computeContentClientRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                    setContentStyleProperty: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCTabIndicatorFoundation.prototype.computeContentClientRect = function () {
            return this.adapter_.computeContentClientRect();
        };
        return MDCTabIndicatorFoundation;
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
    var MDCFadingTabIndicatorFoundation = /** @class */ (function (_super) {
        __extends(MDCFadingTabIndicatorFoundation, _super);
        function MDCFadingTabIndicatorFoundation() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCFadingTabIndicatorFoundation.prototype.activate = function () {
            this.adapter_.addClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
        };
        MDCFadingTabIndicatorFoundation.prototype.deactivate = function () {
            this.adapter_.removeClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
        };
        return MDCFadingTabIndicatorFoundation;
    }(MDCTabIndicatorFoundation));

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
    var MDCSlidingTabIndicatorFoundation = /** @class */ (function (_super) {
        __extends(MDCSlidingTabIndicatorFoundation, _super);
        function MDCSlidingTabIndicatorFoundation() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCSlidingTabIndicatorFoundation.prototype.activate = function (previousIndicatorClientRect) {
            // Early exit if no indicator is present to handle cases where an indicator
            // may be activated without a prior indicator state
            if (!previousIndicatorClientRect) {
                this.adapter_.addClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
                return;
            }
            // This animation uses the FLIP approach. You can read more about it at the link below:
            // https://aerotwist.com/blog/flip-your-animations/
            // Calculate the dimensions based on the dimensions of the previous indicator
            var currentClientRect = this.computeContentClientRect();
            var widthDelta = previousIndicatorClientRect.width / currentClientRect.width;
            var xPosition = previousIndicatorClientRect.left - currentClientRect.left;
            this.adapter_.addClass(MDCTabIndicatorFoundation.cssClasses.NO_TRANSITION);
            this.adapter_.setContentStyleProperty('transform', "translateX(" + xPosition + "px) scaleX(" + widthDelta + ")");
            // Force repaint before updating classes and transform to ensure the transform properly takes effect
            this.computeContentClientRect();
            this.adapter_.removeClass(MDCTabIndicatorFoundation.cssClasses.NO_TRANSITION);
            this.adapter_.addClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
            this.adapter_.setContentStyleProperty('transform', '');
        };
        MDCSlidingTabIndicatorFoundation.prototype.deactivate = function () {
            this.adapter_.removeClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
        };
        return MDCSlidingTabIndicatorFoundation;
    }(MDCTabIndicatorFoundation));

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
    var MDCTabIndicator = /** @class */ (function (_super) {
        __extends(MDCTabIndicator, _super);
        function MDCTabIndicator() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTabIndicator.attachTo = function (root) {
            return new MDCTabIndicator(root);
        };
        MDCTabIndicator.prototype.initialize = function () {
            this.content_ = this.root_.querySelector(MDCTabIndicatorFoundation.strings.CONTENT_SELECTOR);
        };
        MDCTabIndicator.prototype.computeContentClientRect = function () {
            return this.foundation_.computeContentClientRect();
        };
        MDCTabIndicator.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                computeContentClientRect: function () { return _this.content_.getBoundingClientRect(); },
                setContentStyleProperty: function (prop, value) { return _this.content_.style.setProperty(prop, value); },
            };
            // tslint:enable:object-literal-sort-keys
            if (this.root_.classList.contains(MDCTabIndicatorFoundation.cssClasses.FADE)) {
                return new MDCFadingTabIndicatorFoundation(adapter);
            }
            // Default to the sliding indicator
            return new MDCSlidingTabIndicatorFoundation(adapter);
        };
        MDCTabIndicator.prototype.activate = function (previousIndicatorClientRect) {
            this.foundation_.activate(previousIndicatorClientRect);
        };
        MDCTabIndicator.prototype.deactivate = function () {
            this.foundation_.deactivate();
        };
        return MDCTabIndicator;
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
    var cssClasses$8 = {
        ACTIVE: 'mdc-tab--active',
    };
    var strings$a = {
        ARIA_SELECTED: 'aria-selected',
        CONTENT_SELECTOR: '.mdc-tab__content',
        INTERACTED_EVENT: 'MDCTab:interacted',
        RIPPLE_SELECTOR: '.mdc-tab__ripple',
        TABINDEX: 'tabIndex',
        TAB_INDICATOR_SELECTOR: '.mdc-tab-indicator',
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
    var MDCTabFoundation = /** @class */ (function (_super) {
        __extends(MDCTabFoundation, _super);
        function MDCTabFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCTabFoundation.defaultAdapter, adapter)) || this;
            _this.focusOnActivate_ = true;
            return _this;
        }
        Object.defineProperty(MDCTabFoundation, "cssClasses", {
            get: function () {
                return cssClasses$8;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTabFoundation, "strings", {
            get: function () {
                return strings$a;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTabFoundation, "defaultAdapter", {
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    hasClass: function () { return false; },
                    setAttr: function () { return undefined; },
                    activateIndicator: function () { return undefined; },
                    deactivateIndicator: function () { return undefined; },
                    notifyInteracted: function () { return undefined; },
                    getOffsetLeft: function () { return 0; },
                    getOffsetWidth: function () { return 0; },
                    getContentOffsetLeft: function () { return 0; },
                    getContentOffsetWidth: function () { return 0; },
                    focus: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCTabFoundation.prototype.handleClick = function () {
            // It's up to the parent component to keep track of the active Tab and
            // ensure we don't activate a Tab that's already active.
            this.adapter_.notifyInteracted();
        };
        MDCTabFoundation.prototype.isActive = function () {
            return this.adapter_.hasClass(cssClasses$8.ACTIVE);
        };
        /**
         * Sets whether the tab should focus itself when activated
         */
        MDCTabFoundation.prototype.setFocusOnActivate = function (focusOnActivate) {
            this.focusOnActivate_ = focusOnActivate;
        };
        /**
         * Activates the Tab
         */
        MDCTabFoundation.prototype.activate = function (previousIndicatorClientRect) {
            this.adapter_.addClass(cssClasses$8.ACTIVE);
            this.adapter_.setAttr(strings$a.ARIA_SELECTED, 'true');
            this.adapter_.setAttr(strings$a.TABINDEX, '0');
            this.adapter_.activateIndicator(previousIndicatorClientRect);
            if (this.focusOnActivate_) {
                this.adapter_.focus();
            }
        };
        /**
         * Deactivates the Tab
         */
        MDCTabFoundation.prototype.deactivate = function () {
            // Early exit
            if (!this.isActive()) {
                return;
            }
            this.adapter_.removeClass(cssClasses$8.ACTIVE);
            this.adapter_.setAttr(strings$a.ARIA_SELECTED, 'false');
            this.adapter_.setAttr(strings$a.TABINDEX, '-1');
            this.adapter_.deactivateIndicator();
        };
        /**
         * Returns the dimensions of the Tab
         */
        MDCTabFoundation.prototype.computeDimensions = function () {
            var rootWidth = this.adapter_.getOffsetWidth();
            var rootLeft = this.adapter_.getOffsetLeft();
            var contentWidth = this.adapter_.getContentOffsetWidth();
            var contentLeft = this.adapter_.getContentOffsetLeft();
            return {
                contentLeft: rootLeft + contentLeft,
                contentRight: rootLeft + contentLeft + contentWidth,
                rootLeft: rootLeft,
                rootRight: rootLeft + rootWidth,
            };
        };
        return MDCTabFoundation;
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
    var MDCTab = /** @class */ (function (_super) {
        __extends(MDCTab, _super);
        function MDCTab() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTab.attachTo = function (root) {
            return new MDCTab(root);
        };
        MDCTab.prototype.initialize = function (rippleFactory, tabIndicatorFactory) {
            if (rippleFactory === void 0) { rippleFactory = function (el, foundation) { return new MDCRipple(el, foundation); }; }
            if (tabIndicatorFactory === void 0) { tabIndicatorFactory = function (el) { return new MDCTabIndicator(el); }; }
            this.id = this.root_.id;
            var rippleSurface = this.root_.querySelector(MDCTabFoundation.strings.RIPPLE_SELECTOR);
            var rippleAdapter = __assign({}, MDCRipple.createAdapter(this), { addClass: function (className) { return rippleSurface.classList.add(className); }, removeClass: function (className) { return rippleSurface.classList.remove(className); }, updateCssVariable: function (varName, value) { return rippleSurface.style.setProperty(varName, value); } });
            var rippleFoundation = new MDCRippleFoundation(rippleAdapter);
            this.ripple_ = rippleFactory(this.root_, rippleFoundation);
            var tabIndicatorElement = this.root_.querySelector(MDCTabFoundation.strings.TAB_INDICATOR_SELECTOR);
            this.tabIndicator_ = tabIndicatorFactory(tabIndicatorElement);
            this.content_ = this.root_.querySelector(MDCTabFoundation.strings.CONTENT_SELECTOR);
        };
        MDCTab.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.handleClick_ = function () { return _this.foundation_.handleClick(); };
            this.listen('click', this.handleClick_);
        };
        MDCTab.prototype.destroy = function () {
            this.unlisten('click', this.handleClick_);
            this.ripple_.destroy();
            _super.prototype.destroy.call(this);
        };
        MDCTab.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                setAttr: function (attr, value) { return _this.root_.setAttribute(attr, value); },
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                activateIndicator: function (previousIndicatorClientRect) { return _this.tabIndicator_.activate(previousIndicatorClientRect); },
                deactivateIndicator: function () { return _this.tabIndicator_.deactivate(); },
                notifyInteracted: function () { return _this.emit(MDCTabFoundation.strings.INTERACTED_EVENT, { tabId: _this.id }, true /* bubble */); },
                getOffsetLeft: function () { return _this.root_.offsetLeft; },
                getOffsetWidth: function () { return _this.root_.offsetWidth; },
                getContentOffsetLeft: function () { return _this.content_.offsetLeft; },
                getContentOffsetWidth: function () { return _this.content_.offsetWidth; },
                focus: function () { return _this.root_.focus(); },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCTabFoundation(adapter);
        };
        Object.defineProperty(MDCTab.prototype, "active", {
            /**
             * Getter for the active state of the tab
             */
            get: function () {
                return this.foundation_.isActive();
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTab.prototype, "focusOnActivate", {
            set: function (focusOnActivate) {
                this.foundation_.setFocusOnActivate(focusOnActivate);
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Activates the tab
         */
        MDCTab.prototype.activate = function (computeIndicatorClientRect) {
            this.foundation_.activate(computeIndicatorClientRect);
        };
        /**
         * Deactivates the tab
         */
        MDCTab.prototype.deactivate = function () {
            this.foundation_.deactivate();
        };
        /**
         * Returns the indicator's client rect
         */
        MDCTab.prototype.computeIndicatorClientRect = function () {
            return this.tabIndicator_.computeContentClientRect();
        };
        MDCTab.prototype.computeDimensions = function () {
            return this.foundation_.computeDimensions();
        };
        /**
         * Focuses the tab
         */
        MDCTab.prototype.focus = function () {
            this.root_.focus();
        };
        return MDCTab;
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
    var strings$b = {
        ARROW_LEFT_KEY: 'ArrowLeft',
        ARROW_RIGHT_KEY: 'ArrowRight',
        END_KEY: 'End',
        ENTER_KEY: 'Enter',
        HOME_KEY: 'Home',
        SPACE_KEY: 'Space',
        TAB_ACTIVATED_EVENT: 'MDCTabBar:activated',
        TAB_SCROLLER_SELECTOR: '.mdc-tab-scroller',
        TAB_SELECTOR: '.mdc-tab',
    };
    var numbers$4 = {
        ARROW_LEFT_KEYCODE: 37,
        ARROW_RIGHT_KEYCODE: 39,
        END_KEYCODE: 35,
        ENTER_KEYCODE: 13,
        EXTRA_SCROLL_AMOUNT: 20,
        HOME_KEYCODE: 36,
        SPACE_KEYCODE: 32,
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
    var ACCEPTABLE_KEYS = new Set();
    // IE11 has no support for new Set with iterable so we need to initialize this by hand
    ACCEPTABLE_KEYS.add(strings$b.ARROW_LEFT_KEY);
    ACCEPTABLE_KEYS.add(strings$b.ARROW_RIGHT_KEY);
    ACCEPTABLE_KEYS.add(strings$b.END_KEY);
    ACCEPTABLE_KEYS.add(strings$b.HOME_KEY);
    ACCEPTABLE_KEYS.add(strings$b.ENTER_KEY);
    ACCEPTABLE_KEYS.add(strings$b.SPACE_KEY);
    var KEYCODE_MAP = new Map();
    // IE11 has no support for new Map with iterable so we need to initialize this by hand
    KEYCODE_MAP.set(numbers$4.ARROW_LEFT_KEYCODE, strings$b.ARROW_LEFT_KEY);
    KEYCODE_MAP.set(numbers$4.ARROW_RIGHT_KEYCODE, strings$b.ARROW_RIGHT_KEY);
    KEYCODE_MAP.set(numbers$4.END_KEYCODE, strings$b.END_KEY);
    KEYCODE_MAP.set(numbers$4.HOME_KEYCODE, strings$b.HOME_KEY);
    KEYCODE_MAP.set(numbers$4.ENTER_KEYCODE, strings$b.ENTER_KEY);
    KEYCODE_MAP.set(numbers$4.SPACE_KEYCODE, strings$b.SPACE_KEY);
    var MDCTabBarFoundation = /** @class */ (function (_super) {
        __extends(MDCTabBarFoundation, _super);
        function MDCTabBarFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCTabBarFoundation.defaultAdapter, adapter)) || this;
            _this.useAutomaticActivation_ = false;
            return _this;
        }
        Object.defineProperty(MDCTabBarFoundation, "strings", {
            get: function () {
                return strings$b;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTabBarFoundation, "numbers", {
            get: function () {
                return numbers$4;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTabBarFoundation, "defaultAdapter", {
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    scrollTo: function () { return undefined; },
                    incrementScroll: function () { return undefined; },
                    getScrollPosition: function () { return 0; },
                    getScrollContentWidth: function () { return 0; },
                    getOffsetWidth: function () { return 0; },
                    isRTL: function () { return false; },
                    setActiveTab: function () { return undefined; },
                    activateTabAtIndex: function () { return undefined; },
                    deactivateTabAtIndex: function () { return undefined; },
                    focusTabAtIndex: function () { return undefined; },
                    getTabIndicatorClientRectAtIndex: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                    getTabDimensionsAtIndex: function () { return ({ rootLeft: 0, rootRight: 0, contentLeft: 0, contentRight: 0 }); },
                    getPreviousActiveTabIndex: function () { return -1; },
                    getFocusedTabIndex: function () { return -1; },
                    getIndexOfTabById: function () { return -1; },
                    getTabListLength: function () { return 0; },
                    notifyTabActivated: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Switches between automatic and manual activation modes.
         * See https://www.w3.org/TR/wai-aria-practices/#tabpanel for examples.
         */
        MDCTabBarFoundation.prototype.setUseAutomaticActivation = function (useAutomaticActivation) {
            this.useAutomaticActivation_ = useAutomaticActivation;
        };
        MDCTabBarFoundation.prototype.activateTab = function (index) {
            var previousActiveIndex = this.adapter_.getPreviousActiveTabIndex();
            if (!this.indexIsInRange_(index) || index === previousActiveIndex) {
                return;
            }
            var previousClientRect;
            if (previousActiveIndex !== -1) {
                this.adapter_.deactivateTabAtIndex(previousActiveIndex);
                previousClientRect = this.adapter_.getTabIndicatorClientRectAtIndex(previousActiveIndex);
            }
            this.adapter_.activateTabAtIndex(index, previousClientRect);
            this.scrollIntoView(index);
            this.adapter_.notifyTabActivated(index);
        };
        MDCTabBarFoundation.prototype.handleKeyDown = function (evt) {
            // Get the key from the event
            var key = this.getKeyFromEvent_(evt);
            // Early exit if the event key isn't one of the keyboard navigation keys
            if (key === undefined) {
                return;
            }
            // Prevent default behavior for movement keys, but not for activation keys, since :active is used to apply ripple
            if (!this.isActivationKey_(key)) {
                evt.preventDefault();
            }
            if (this.useAutomaticActivation_) {
                if (this.isActivationKey_(key)) {
                    return;
                }
                var index = this.determineTargetFromKey_(this.adapter_.getPreviousActiveTabIndex(), key);
                this.adapter_.setActiveTab(index);
                this.scrollIntoView(index);
            }
            else {
                var focusedTabIndex = this.adapter_.getFocusedTabIndex();
                if (this.isActivationKey_(key)) {
                    this.adapter_.setActiveTab(focusedTabIndex);
                }
                else {
                    var index = this.determineTargetFromKey_(focusedTabIndex, key);
                    this.adapter_.focusTabAtIndex(index);
                    this.scrollIntoView(index);
                }
            }
        };
        /**
         * Handles the MDCTab:interacted event
         */
        MDCTabBarFoundation.prototype.handleTabInteraction = function (evt) {
            this.adapter_.setActiveTab(this.adapter_.getIndexOfTabById(evt.detail.tabId));
        };
        /**
         * Scrolls the tab at the given index into view
         * @param index The tab index to make visible
         */
        MDCTabBarFoundation.prototype.scrollIntoView = function (index) {
            // Early exit if the index is out of range
            if (!this.indexIsInRange_(index)) {
                return;
            }
            // Always scroll to 0 if scrolling to the 0th index
            if (index === 0) {
                return this.adapter_.scrollTo(0);
            }
            // Always scroll to the max value if scrolling to the Nth index
            // MDCTabScroller.scrollTo() will never scroll past the max possible value
            if (index === this.adapter_.getTabListLength() - 1) {
                return this.adapter_.scrollTo(this.adapter_.getScrollContentWidth());
            }
            if (this.isRTL_()) {
                return this.scrollIntoViewRTL_(index);
            }
            this.scrollIntoView_(index);
        };
        /**
         * Private method for determining the index of the destination tab based on what key was pressed
         * @param origin The original index from which to determine the destination
         * @param key The name of the key
         */
        MDCTabBarFoundation.prototype.determineTargetFromKey_ = function (origin, key) {
            var isRTL = this.isRTL_();
            var maxIndex = this.adapter_.getTabListLength() - 1;
            var shouldGoToEnd = key === strings$b.END_KEY;
            var shouldDecrement = key === strings$b.ARROW_LEFT_KEY && !isRTL || key === strings$b.ARROW_RIGHT_KEY && isRTL;
            var shouldIncrement = key === strings$b.ARROW_RIGHT_KEY && !isRTL || key === strings$b.ARROW_LEFT_KEY && isRTL;
            var index = origin;
            if (shouldGoToEnd) {
                index = maxIndex;
            }
            else if (shouldDecrement) {
                index -= 1;
            }
            else if (shouldIncrement) {
                index += 1;
            }
            else {
                index = 0;
            }
            if (index < 0) {
                index = maxIndex;
            }
            else if (index > maxIndex) {
                index = 0;
            }
            return index;
        };
        /**
         * Calculates the scroll increment that will make the tab at the given index visible
         * @param index The index of the tab
         * @param nextIndex The index of the next tab
         * @param scrollPosition The current scroll position
         * @param barWidth The width of the Tab Bar
         */
        MDCTabBarFoundation.prototype.calculateScrollIncrement_ = function (index, nextIndex, scrollPosition, barWidth) {
            var nextTabDimensions = this.adapter_.getTabDimensionsAtIndex(nextIndex);
            var relativeContentLeft = nextTabDimensions.contentLeft - scrollPosition - barWidth;
            var relativeContentRight = nextTabDimensions.contentRight - scrollPosition;
            var leftIncrement = relativeContentRight - numbers$4.EXTRA_SCROLL_AMOUNT;
            var rightIncrement = relativeContentLeft + numbers$4.EXTRA_SCROLL_AMOUNT;
            if (nextIndex < index) {
                return Math.min(leftIncrement, 0);
            }
            return Math.max(rightIncrement, 0);
        };
        /**
         * Calculates the scroll increment that will make the tab at the given index visible in RTL
         * @param index The index of the tab
         * @param nextIndex The index of the next tab
         * @param scrollPosition The current scroll position
         * @param barWidth The width of the Tab Bar
         * @param scrollContentWidth The width of the scroll content
         */
        MDCTabBarFoundation.prototype.calculateScrollIncrementRTL_ = function (index, nextIndex, scrollPosition, barWidth, scrollContentWidth) {
            var nextTabDimensions = this.adapter_.getTabDimensionsAtIndex(nextIndex);
            var relativeContentLeft = scrollContentWidth - nextTabDimensions.contentLeft - scrollPosition;
            var relativeContentRight = scrollContentWidth - nextTabDimensions.contentRight - scrollPosition - barWidth;
            var leftIncrement = relativeContentRight + numbers$4.EXTRA_SCROLL_AMOUNT;
            var rightIncrement = relativeContentLeft - numbers$4.EXTRA_SCROLL_AMOUNT;
            if (nextIndex > index) {
                return Math.max(leftIncrement, 0);
            }
            return Math.min(rightIncrement, 0);
        };
        /**
         * Determines the index of the adjacent tab closest to either edge of the Tab Bar
         * @param index The index of the tab
         * @param tabDimensions The dimensions of the tab
         * @param scrollPosition The current scroll position
         * @param barWidth The width of the tab bar
         */
        MDCTabBarFoundation.prototype.findAdjacentTabIndexClosestToEdge_ = function (index, tabDimensions, scrollPosition, barWidth) {
            /**
             * Tabs are laid out in the Tab Scroller like this:
             *
             *    Scroll Position
             *    +---+
             *    |   |   Bar Width
             *    |   +-----------------------------------+
             *    |   |                                   |
             *    |   V                                   V
             *    |   +-----------------------------------+
             *    V   |             Tab Scroller          |
             *    +------------+--------------+-------------------+
             *    |    Tab     |      Tab     |        Tab        |
             *    +------------+--------------+-------------------+
             *        |                                   |
             *        +-----------------------------------+
             *
             * To determine the next adjacent index, we look at the Tab root left and
             * Tab root right, both relative to the scroll position. If the Tab root
             * left is less than 0, then we know it's out of view to the left. If the
             * Tab root right minus the bar width is greater than 0, we know the Tab is
             * out of view to the right. From there, we either increment or decrement
             * the index.
             */
            var relativeRootLeft = tabDimensions.rootLeft - scrollPosition;
            var relativeRootRight = tabDimensions.rootRight - scrollPosition - barWidth;
            var relativeRootDelta = relativeRootLeft + relativeRootRight;
            var leftEdgeIsCloser = relativeRootLeft < 0 || relativeRootDelta < 0;
            var rightEdgeIsCloser = relativeRootRight > 0 || relativeRootDelta > 0;
            if (leftEdgeIsCloser) {
                return index - 1;
            }
            if (rightEdgeIsCloser) {
                return index + 1;
            }
            return -1;
        };
        /**
         * Determines the index of the adjacent tab closest to either edge of the Tab Bar in RTL
         * @param index The index of the tab
         * @param tabDimensions The dimensions of the tab
         * @param scrollPosition The current scroll position
         * @param barWidth The width of the tab bar
         * @param scrollContentWidth The width of the scroller content
         */
        MDCTabBarFoundation.prototype.findAdjacentTabIndexClosestToEdgeRTL_ = function (index, tabDimensions, scrollPosition, barWidth, scrollContentWidth) {
            var rootLeft = scrollContentWidth - tabDimensions.rootLeft - barWidth - scrollPosition;
            var rootRight = scrollContentWidth - tabDimensions.rootRight - scrollPosition;
            var rootDelta = rootLeft + rootRight;
            var leftEdgeIsCloser = rootLeft > 0 || rootDelta > 0;
            var rightEdgeIsCloser = rootRight < 0 || rootDelta < 0;
            if (leftEdgeIsCloser) {
                return index + 1;
            }
            if (rightEdgeIsCloser) {
                return index - 1;
            }
            return -1;
        };
        /**
         * Returns the key associated with a keydown event
         * @param evt The keydown event
         */
        MDCTabBarFoundation.prototype.getKeyFromEvent_ = function (evt) {
            if (ACCEPTABLE_KEYS.has(evt.key)) {
                return evt.key;
            }
            return KEYCODE_MAP.get(evt.keyCode);
        };
        MDCTabBarFoundation.prototype.isActivationKey_ = function (key) {
            return key === strings$b.SPACE_KEY || key === strings$b.ENTER_KEY;
        };
        /**
         * Returns whether a given index is inclusively between the ends
         * @param index The index to test
         */
        MDCTabBarFoundation.prototype.indexIsInRange_ = function (index) {
            return index >= 0 && index < this.adapter_.getTabListLength();
        };
        /**
         * Returns the view's RTL property
         */
        MDCTabBarFoundation.prototype.isRTL_ = function () {
            return this.adapter_.isRTL();
        };
        /**
         * Scrolls the tab at the given index into view for left-to-right user agents.
         * @param index The index of the tab to scroll into view
         */
        MDCTabBarFoundation.prototype.scrollIntoView_ = function (index) {
            var scrollPosition = this.adapter_.getScrollPosition();
            var barWidth = this.adapter_.getOffsetWidth();
            var tabDimensions = this.adapter_.getTabDimensionsAtIndex(index);
            var nextIndex = this.findAdjacentTabIndexClosestToEdge_(index, tabDimensions, scrollPosition, barWidth);
            if (!this.indexIsInRange_(nextIndex)) {
                return;
            }
            var scrollIncrement = this.calculateScrollIncrement_(index, nextIndex, scrollPosition, barWidth);
            this.adapter_.incrementScroll(scrollIncrement);
        };
        /**
         * Scrolls the tab at the given index into view in RTL
         * @param index The tab index to make visible
         */
        MDCTabBarFoundation.prototype.scrollIntoViewRTL_ = function (index) {
            var scrollPosition = this.adapter_.getScrollPosition();
            var barWidth = this.adapter_.getOffsetWidth();
            var tabDimensions = this.adapter_.getTabDimensionsAtIndex(index);
            var scrollWidth = this.adapter_.getScrollContentWidth();
            var nextIndex = this.findAdjacentTabIndexClosestToEdgeRTL_(index, tabDimensions, scrollPosition, barWidth, scrollWidth);
            if (!this.indexIsInRange_(nextIndex)) {
                return;
            }
            var scrollIncrement = this.calculateScrollIncrementRTL_(index, nextIndex, scrollPosition, barWidth, scrollWidth);
            this.adapter_.incrementScroll(scrollIncrement);
        };
        return MDCTabBarFoundation;
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
    var strings$c = MDCTabBarFoundation.strings;
    var tabIdCounter = 0;
    var MDCTabBar = /** @class */ (function (_super) {
        __extends(MDCTabBar, _super);
        function MDCTabBar() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTabBar.attachTo = function (root) {
            return new MDCTabBar(root);
        };
        Object.defineProperty(MDCTabBar.prototype, "focusOnActivate", {
            set: function (focusOnActivate) {
                this.tabList_.forEach(function (tab) { return tab.focusOnActivate = focusOnActivate; });
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTabBar.prototype, "useAutomaticActivation", {
            set: function (useAutomaticActivation) {
                this.foundation_.setUseAutomaticActivation(useAutomaticActivation);
            },
            enumerable: true,
            configurable: true
        });
        MDCTabBar.prototype.initialize = function (tabFactory, tabScrollerFactory) {
            if (tabFactory === void 0) { tabFactory = function (el) { return new MDCTab(el); }; }
            if (tabScrollerFactory === void 0) { tabScrollerFactory = function (el) { return new MDCTabScroller(el); }; }
            this.tabList_ = this.instantiateTabs_(tabFactory);
            this.tabScroller_ = this.instantiateTabScroller_(tabScrollerFactory);
        };
        MDCTabBar.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.handleTabInteraction_ = function (evt) { return _this.foundation_.handleTabInteraction(evt); };
            this.handleKeyDown_ = function (evt) { return _this.foundation_.handleKeyDown(evt); };
            this.listen(MDCTabFoundation.strings.INTERACTED_EVENT, this.handleTabInteraction_);
            this.listen('keydown', this.handleKeyDown_);
            for (var i = 0; i < this.tabList_.length; i++) {
                if (this.tabList_[i].active) {
                    this.scrollIntoView(i);
                    break;
                }
            }
        };
        MDCTabBar.prototype.destroy = function () {
            _super.prototype.destroy.call(this);
            this.unlisten(MDCTabFoundation.strings.INTERACTED_EVENT, this.handleTabInteraction_);
            this.unlisten('keydown', this.handleKeyDown_);
            this.tabList_.forEach(function (tab) { return tab.destroy(); });
            if (this.tabScroller_) {
                this.tabScroller_.destroy();
            }
        };
        MDCTabBar.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                scrollTo: function (scrollX) { return _this.tabScroller_.scrollTo(scrollX); },
                incrementScroll: function (scrollXIncrement) { return _this.tabScroller_.incrementScroll(scrollXIncrement); },
                getScrollPosition: function () { return _this.tabScroller_.getScrollPosition(); },
                getScrollContentWidth: function () { return _this.tabScroller_.getScrollContentWidth(); },
                getOffsetWidth: function () { return _this.root_.offsetWidth; },
                isRTL: function () { return window.getComputedStyle(_this.root_).getPropertyValue('direction') === 'rtl'; },
                setActiveTab: function (index) { return _this.foundation_.activateTab(index); },
                activateTabAtIndex: function (index, clientRect) { return _this.tabList_[index].activate(clientRect); },
                deactivateTabAtIndex: function (index) { return _this.tabList_[index].deactivate(); },
                focusTabAtIndex: function (index) { return _this.tabList_[index].focus(); },
                getTabIndicatorClientRectAtIndex: function (index) { return _this.tabList_[index].computeIndicatorClientRect(); },
                getTabDimensionsAtIndex: function (index) { return _this.tabList_[index].computeDimensions(); },
                getPreviousActiveTabIndex: function () {
                    for (var i = 0; i < _this.tabList_.length; i++) {
                        if (_this.tabList_[i].active) {
                            return i;
                        }
                    }
                    return -1;
                },
                getFocusedTabIndex: function () {
                    var tabElements = _this.getTabElements_();
                    var activeElement = document.activeElement;
                    return tabElements.indexOf(activeElement);
                },
                getIndexOfTabById: function (id) {
                    for (var i = 0; i < _this.tabList_.length; i++) {
                        if (_this.tabList_[i].id === id) {
                            return i;
                        }
                    }
                    return -1;
                },
                getTabListLength: function () { return _this.tabList_.length; },
                notifyTabActivated: function (index) {
                    return _this.emit(strings$c.TAB_ACTIVATED_EVENT, { index: index }, true);
                },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCTabBarFoundation(adapter);
        };
        /**
         * Activates the tab at the given index
         * @param index The index of the tab
         */
        MDCTabBar.prototype.activateTab = function (index) {
            this.foundation_.activateTab(index);
        };
        /**
         * Scrolls the tab at the given index into view
         * @param index THe index of the tab
         */
        MDCTabBar.prototype.scrollIntoView = function (index) {
            this.foundation_.scrollIntoView(index);
        };
        /**
         * Returns all the tab elements in a nice clean array
         */
        MDCTabBar.prototype.getTabElements_ = function () {
            return [].slice.call(this.root_.querySelectorAll(strings$c.TAB_SELECTOR));
        };
        /**
         * Instantiates tab components on all child tab elements
         */
        MDCTabBar.prototype.instantiateTabs_ = function (tabFactory) {
            return this.getTabElements_().map(function (el) {
                el.id = el.id || "mdc-tab-" + ++tabIdCounter;
                return tabFactory(el);
            });
        };
        /**
         * Instantiates tab scroller component on the child tab scroller element
         */
        MDCTabBar.prototype.instantiateTabScroller_ = function (tabScrollerFactory) {
            var tabScrollerElement = this.root_.querySelector(strings$c.TAB_SCROLLER_SELECTOR);
            if (tabScrollerElement) {
                return tabScrollerFactory(tabScrollerElement);
            }
            return null;
        };
        return MDCTabBar;
    }(MDCComponent));

    /* src\components\Tab\TabBar.svelte generated by Svelte v3.6.1 */
    const { console: console_1$1 } = globals;

    const file$k = "src\\components\\Tab\\TabBar.svelte";

    function create_fragment$k(ctx) {
    	var div, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	var div_levels = [
    		ctx.attrs
    	];

    	var div_data = {};
    	for (var i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c: function create() {
    			div = element("div");

    			if (default_slot) default_slot.c();

    			set_attributes(div, div_data);
    			add_location(div, file$k, 55, 0, 1297);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(div_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			add_binding_callback(() => ctx.div_binding(div, null));
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (changed.items) {
    				ctx.div_binding(null, div);
    				ctx.div_binding(div, null);
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				(changed.attrs) && ctx.attrs
    			]));
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (default_slot) default_slot.d(detaching);
    			ctx.div_binding(null, div);
    		}
    	};
    }

    function instance$k($$self, $$props, $$invalidate) {
    	
      
      const dispatch = createEventDispatcher();

      let { bar = null, activeTabIndex = 0 } = $$props;
      let mdcComponent;

      onMount(() => {
        {
          mdcComponent = MDCTabBar.attachTo(bar);
        }
        mdcComponent.listen("MDCTabBar:activated", data => {
          dispatch("change", { activeTabIndex: data.detail.index });
          if (data.detail.index !== activeTabIndex) {
            $$invalidate('activeTabIndex', activeTabIndex = data.detail.index);
          }
          console.log('tab-change', activeTabIndex);
        });
      });

      onDestroy(() => {
        if (!!mdcComponent) {
          mdcComponent.destroy();
        }
      });

      let prevTabIndex;
      beforeUpdate(() => {
        if (activeTabIndex && prevTabIndex) {
          mdcComponent.activateTab(activeTabIndex);
        }
        prevTabIndex = activeTabIndex;
      });

      let { attrs } = $$props;

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$node, check) {
    		bar = $$node;
    		$$invalidate('bar', bar);
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate('$$props', $$props = assign(assign({}, $$props), $$new_props));
    		if ('bar' in $$new_props) $$invalidate('bar', bar = $$new_props.bar);
    		if ('activeTabIndex' in $$new_props) $$invalidate('activeTabIndex', activeTabIndex = $$new_props.activeTabIndex);
    		if ('attrs' in $$new_props) $$invalidate('attrs', attrs = $$new_props.attrs);
    		if ('$$scope' in $$new_props) $$invalidate('$$scope', $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { $$props: 1 }) => {
    		{
            let result = Object.assign({ role: "tablist" }, $$props);
            let classes = ["mdc-tab-bar"];
            result["class"] = processClasses(classes, result["class"]);
            $$invalidate('attrs', attrs = result);
          }
    	};

    	return {
    		bar,
    		activeTabIndex,
    		attrs,
    		div_binding,
    		$$props: $$props = exclude_internal_props($$props),
    		$$slots,
    		$$scope
    	};
    }

    class TabBar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$k, create_fragment$k, safe_not_equal, ["bar", "activeTabIndex", "attrs"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.attrs === undefined && !('attrs' in props)) {
    			console_1$1.warn("<TabBar> was created without expected prop 'attrs'");
    		}
    	}

    	get bar() {
    		throw new Error("<TabBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set bar(value) {
    		throw new Error("<TabBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get activeTabIndex() {
    		throw new Error("<TabBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set activeTabIndex(value) {
    		throw new Error("<TabBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get attrs() {
    		throw new Error("<TabBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set attrs(value) {
    		throw new Error("<TabBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Tab\TabScroller.svelte generated by Svelte v3.6.1 */

    const file$l = "src\\components\\Tab\\TabScroller.svelte";

    function create_fragment$l(ctx) {
    	var div2, div1, div0, current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	var div2_levels = [
    		ctx.attrs
    	];

    	var div2_data = {};
    	for (var i = 0; i < div2_levels.length; i += 1) {
    		div2_data = assign(div2_data, div2_levels[i]);
    	}

    	return {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");

    			if (default_slot) default_slot.c();

    			attr(div0, "class", "mdc-tab-scroller__scroll-content");
    			add_location(div0, file$l, 39, 4, 1041);
    			attr(div1, "class", "mdc-tab-scroller__scroll-area");
    			add_location(div1, file$l, 38, 2, 993);
    			set_attributes(div2, div2_data);
    			add_location(div2, file$l, 37, 0, 951);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(div0_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			add_binding_callback(() => ctx.div2_binding(div2, null));
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}

    			if (changed.items) {
    				ctx.div2_binding(null, div2);
    				ctx.div2_binding(div2, null);
    			}

    			set_attributes(div2, get_spread_update(div2_levels, [
    				(changed.attrs) && ctx.attrs
    			]));
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div2);
    			}

    			if (default_slot) default_slot.d(detaching);
    			ctx.div2_binding(null, div2);
    		}
    	};
    }

    function instance$l($$self, $$props, $$invalidate) {
    	

      let { scroller, checked = false, indeterminate = false } = $$props;
      let mdcComponent = null;

      onMount(() => {
        mdcComponent = new MDCTabScroller(scroller);
      });

      onDestroy(() => {
        mdcComponent.destroy();
      });

      // [svelte-upgrade warning]
      // this function needs to be manually rewritten
      let { attrs } = $$props;

    	let { $$slots = {}, $$scope } = $$props;

    	function div2_binding($$node, check) {
    		scroller = $$node;
    		$$invalidate('scroller', scroller);
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate('$$props', $$props = assign(assign({}, $$props), $$new_props));
    		if ('scroller' in $$new_props) $$invalidate('scroller', scroller = $$new_props.scroller);
    		if ('checked' in $$new_props) $$invalidate('checked', checked = $$new_props.checked);
    		if ('indeterminate' in $$new_props) $$invalidate('indeterminate', indeterminate = $$new_props.indeterminate);
    		if ('attrs' in $$new_props) $$invalidate('attrs', attrs = $$new_props.attrs);
    		if ('$$scope' in $$new_props) $$invalidate('$$scope', $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { $$props: 1 }) => {
    		{
            let result = Object.assign({}, $$props);
            let cls = "mdc-tab-scroller";
            let classes = [cls];
            if (["start", "end", "center"].includes(result["align"])) {
              classes.push(cls + "--align-" + result.align);
              delete result.align;
            }
            result["class"] = processClasses(classes, result["class"]);
            $$invalidate('attrs', attrs = result);
          }
    	};

    	return {
    		scroller,
    		checked,
    		indeterminate,
    		attrs,
    		div2_binding,
    		$$props: $$props = exclude_internal_props($$props),
    		$$slots,
    		$$scope
    	};
    }

    class TabScroller extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$l, create_fragment$l, safe_not_equal, ["scroller", "checked", "indeterminate", "attrs"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.scroller === undefined && !('scroller' in props)) {
    			console.warn("<TabScroller> was created without expected prop 'scroller'");
    		}
    		if (ctx.attrs === undefined && !('attrs' in props)) {
    			console.warn("<TabScroller> was created without expected prop 'attrs'");
    		}
    	}

    	get scroller() {
    		throw new Error("<TabScroller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scroller(value) {
    		throw new Error("<TabScroller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get checked() {
    		throw new Error("<TabScroller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set checked(value) {
    		throw new Error("<TabScroller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get indeterminate() {
    		throw new Error("<TabScroller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set indeterminate(value) {
    		throw new Error("<TabScroller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get attrs() {
    		throw new Error("<TabScroller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set attrs(value) {
    		throw new Error("<TabScroller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
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
    var cssClasses$9 = {
        ANCHOR: 'mdc-menu-surface--anchor',
        ANIMATING_CLOSED: 'mdc-menu-surface--animating-closed',
        ANIMATING_OPEN: 'mdc-menu-surface--animating-open',
        FIXED: 'mdc-menu-surface--fixed',
        OPEN: 'mdc-menu-surface--open',
        ROOT: 'mdc-menu-surface',
    };
    // tslint:disable:object-literal-sort-keys
    var strings$d = {
        CLOSED_EVENT: 'MDCMenuSurface:closed',
        OPENED_EVENT: 'MDCMenuSurface:opened',
        FOCUSABLE_ELEMENTS: [
            'button:not(:disabled)', '[href]:not([aria-disabled="true"])', 'input:not(:disabled)',
            'select:not(:disabled)', 'textarea:not(:disabled)', '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
        ].join(', '),
    };
    // tslint:enable:object-literal-sort-keys
    var numbers$5 = {
        /** Total duration of menu-surface open animation. */
        TRANSITION_OPEN_DURATION: 120,
        /** Total duration of menu-surface close animation. */
        TRANSITION_CLOSE_DURATION: 75,
        /** Margin left to the edge of the viewport when menu-surface is at maximum possible height. */
        MARGIN_TO_EDGE: 32,
        /** Ratio of anchor width to menu-surface width for switching from corner positioning to center positioning. */
        ANCHOR_TO_MENU_SURFACE_WIDTH_RATIO: 0.67,
    };
    /**
     * Enum for bits in the {@see Corner) bitmap.
     */
    var CornerBit;
    (function (CornerBit) {
        CornerBit[CornerBit["BOTTOM"] = 1] = "BOTTOM";
        CornerBit[CornerBit["CENTER"] = 2] = "CENTER";
        CornerBit[CornerBit["RIGHT"] = 4] = "RIGHT";
        CornerBit[CornerBit["FLIP_RTL"] = 8] = "FLIP_RTL";
    })(CornerBit || (CornerBit = {}));
    /**
     * Enum for representing an element corner for positioning the menu-surface.
     *
     * The START constants map to LEFT if element directionality is left
     * to right and RIGHT if the directionality is right to left.
     * Likewise END maps to RIGHT or LEFT depending on the directionality.
     */
    var Corner;
    (function (Corner) {
        Corner[Corner["TOP_LEFT"] = 0] = "TOP_LEFT";
        Corner[Corner["TOP_RIGHT"] = 4] = "TOP_RIGHT";
        Corner[Corner["BOTTOM_LEFT"] = 1] = "BOTTOM_LEFT";
        Corner[Corner["BOTTOM_RIGHT"] = 5] = "BOTTOM_RIGHT";
        Corner[Corner["TOP_START"] = 8] = "TOP_START";
        Corner[Corner["TOP_END"] = 12] = "TOP_END";
        Corner[Corner["BOTTOM_START"] = 9] = "BOTTOM_START";
        Corner[Corner["BOTTOM_END"] = 13] = "BOTTOM_END";
    })(Corner || (Corner = {}));

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
    var MDCMenuSurfaceFoundation = /** @class */ (function (_super) {
        __extends(MDCMenuSurfaceFoundation, _super);
        function MDCMenuSurfaceFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCMenuSurfaceFoundation.defaultAdapter, adapter)) || this;
            _this.isOpen_ = false;
            _this.isQuickOpen_ = false;
            _this.isHoistedElement_ = false;
            _this.isFixedPosition_ = false;
            _this.openAnimationEndTimerId_ = 0;
            _this.closeAnimationEndTimerId_ = 0;
            _this.animationRequestId_ = 0;
            _this.anchorCorner_ = Corner.TOP_START;
            _this.anchorMargin_ = { top: 0, right: 0, bottom: 0, left: 0 };
            _this.position_ = { x: 0, y: 0 };
            return _this;
        }
        Object.defineProperty(MDCMenuSurfaceFoundation, "cssClasses", {
            get: function () {
                return cssClasses$9;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenuSurfaceFoundation, "strings", {
            get: function () {
                return strings$d;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenuSurfaceFoundation, "numbers", {
            get: function () {
                return numbers$5;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenuSurfaceFoundation, "Corner", {
            get: function () {
                return Corner;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenuSurfaceFoundation, "defaultAdapter", {
            /**
             * @see {@link MDCMenuSurfaceAdapter} for typing information on parameters and return types.
             */
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    hasClass: function () { return false; },
                    hasAnchor: function () { return false; },
                    isElementInContainer: function () { return false; },
                    isFocused: function () { return false; },
                    isFirstElementFocused: function () { return false; },
                    isLastElementFocused: function () { return false; },
                    isRtl: function () { return false; },
                    getInnerDimensions: function () { return ({ height: 0, width: 0 }); },
                    getAnchorDimensions: function () { return null; },
                    getWindowDimensions: function () { return ({ height: 0, width: 0 }); },
                    getBodyDimensions: function () { return ({ height: 0, width: 0 }); },
                    getWindowScroll: function () { return ({ x: 0, y: 0 }); },
                    setPosition: function () { return undefined; },
                    setMaxHeight: function () { return undefined; },
                    setTransformOrigin: function () { return undefined; },
                    saveFocus: function () { return undefined; },
                    restoreFocus: function () { return undefined; },
                    focusFirstElement: function () { return undefined; },
                    focusLastElement: function () { return undefined; },
                    notifyClose: function () { return undefined; },
                    notifyOpen: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCMenuSurfaceFoundation.prototype.init = function () {
            var _a = MDCMenuSurfaceFoundation.cssClasses, ROOT = _a.ROOT, OPEN = _a.OPEN;
            if (!this.adapter_.hasClass(ROOT)) {
                throw new Error(ROOT + " class required in root element.");
            }
            if (this.adapter_.hasClass(OPEN)) {
                this.isOpen_ = true;
            }
        };
        MDCMenuSurfaceFoundation.prototype.destroy = function () {
            clearTimeout(this.openAnimationEndTimerId_);
            clearTimeout(this.closeAnimationEndTimerId_);
            // Cancel any currently running animations.
            cancelAnimationFrame(this.animationRequestId_);
        };
        /**
         * @param corner Default anchor corner alignment of top-left menu surface corner.
         */
        MDCMenuSurfaceFoundation.prototype.setAnchorCorner = function (corner) {
            this.anchorCorner_ = corner;
        };
        /**
         * @param margin Set of margin values from anchor.
         */
        MDCMenuSurfaceFoundation.prototype.setAnchorMargin = function (margin) {
            this.anchorMargin_.top = margin.top || 0;
            this.anchorMargin_.right = margin.right || 0;
            this.anchorMargin_.bottom = margin.bottom || 0;
            this.anchorMargin_.left = margin.left || 0;
        };
        /** Used to indicate if the menu-surface is hoisted to the body. */
        MDCMenuSurfaceFoundation.prototype.setIsHoisted = function (isHoisted) {
            this.isHoistedElement_ = isHoisted;
        };
        /** Used to set the menu-surface calculations based on a fixed position menu. */
        MDCMenuSurfaceFoundation.prototype.setFixedPosition = function (isFixedPosition) {
            this.isFixedPosition_ = isFixedPosition;
        };
        /** Sets the menu-surface position on the page. */
        MDCMenuSurfaceFoundation.prototype.setAbsolutePosition = function (x, y) {
            this.position_.x = this.isFinite_(x) ? x : 0;
            this.position_.y = this.isFinite_(y) ? y : 0;
        };
        MDCMenuSurfaceFoundation.prototype.setQuickOpen = function (quickOpen) {
            this.isQuickOpen_ = quickOpen;
        };
        MDCMenuSurfaceFoundation.prototype.isOpen = function () {
            return this.isOpen_;
        };
        /**
         * Open the menu surface.
         */
        MDCMenuSurfaceFoundation.prototype.open = function () {
            var _this = this;
            this.adapter_.saveFocus();
            if (!this.isQuickOpen_) {
                this.adapter_.addClass(MDCMenuSurfaceFoundation.cssClasses.ANIMATING_OPEN);
            }
            this.animationRequestId_ = requestAnimationFrame(function () {
                _this.adapter_.addClass(MDCMenuSurfaceFoundation.cssClasses.OPEN);
                _this.dimensions_ = _this.adapter_.getInnerDimensions();
                _this.autoPosition_();
                if (_this.isQuickOpen_) {
                    _this.adapter_.notifyOpen();
                }
                else {
                    _this.openAnimationEndTimerId_ = setTimeout(function () {
                        _this.openAnimationEndTimerId_ = 0;
                        _this.adapter_.removeClass(MDCMenuSurfaceFoundation.cssClasses.ANIMATING_OPEN);
                        _this.adapter_.notifyOpen();
                    }, numbers$5.TRANSITION_OPEN_DURATION);
                }
            });
            this.isOpen_ = true;
        };
        /**
         * Closes the menu surface.
         */
        MDCMenuSurfaceFoundation.prototype.close = function () {
            var _this = this;
            if (!this.isQuickOpen_) {
                this.adapter_.addClass(MDCMenuSurfaceFoundation.cssClasses.ANIMATING_CLOSED);
            }
            requestAnimationFrame(function () {
                _this.adapter_.removeClass(MDCMenuSurfaceFoundation.cssClasses.OPEN);
                if (_this.isQuickOpen_) {
                    _this.adapter_.notifyClose();
                }
                else {
                    _this.closeAnimationEndTimerId_ = setTimeout(function () {
                        _this.closeAnimationEndTimerId_ = 0;
                        _this.adapter_.removeClass(MDCMenuSurfaceFoundation.cssClasses.ANIMATING_CLOSED);
                        _this.adapter_.notifyClose();
                    }, numbers$5.TRANSITION_CLOSE_DURATION);
                }
            });
            this.isOpen_ = false;
            this.maybeRestoreFocus_();
        };
        /** Handle clicks and close if not within menu-surface element. */
        MDCMenuSurfaceFoundation.prototype.handleBodyClick = function (evt) {
            var el = evt.target;
            if (this.adapter_.isElementInContainer(el)) {
                return;
            }
            this.close();
        };
        /** Handle keys that close the surface. */
        MDCMenuSurfaceFoundation.prototype.handleKeydown = function (evt) {
            var keyCode = evt.keyCode, key = evt.key, shiftKey = evt.shiftKey;
            var isEscape = key === 'Escape' || keyCode === 27;
            var isTab = key === 'Tab' || keyCode === 9;
            if (isEscape) {
                this.close();
            }
            else if (isTab) {
                if (this.adapter_.isLastElementFocused() && !shiftKey) {
                    this.adapter_.focusFirstElement();
                    evt.preventDefault();
                }
                else if (this.adapter_.isFirstElementFocused() && shiftKey) {
                    this.adapter_.focusLastElement();
                    evt.preventDefault();
                }
            }
        };
        MDCMenuSurfaceFoundation.prototype.autoPosition_ = function () {
            var _a;
            // Compute measurements for autoposition methods reuse.
            this.measurements_ = this.getAutoLayoutMeasurements_();
            var corner = this.getOriginCorner_();
            var maxMenuSurfaceHeight = this.getMenuSurfaceMaxHeight_(corner);
            var verticalAlignment = this.hasBit_(corner, CornerBit.BOTTOM) ? 'bottom' : 'top';
            var horizontalAlignment = this.hasBit_(corner, CornerBit.RIGHT) ? 'right' : 'left';
            var horizontalOffset = this.getHorizontalOriginOffset_(corner);
            var verticalOffset = this.getVerticalOriginOffset_(corner);
            var _b = this.measurements_, anchorSize = _b.anchorSize, surfaceSize = _b.surfaceSize;
            var position = (_a = {},
                _a[horizontalAlignment] = horizontalOffset,
                _a[verticalAlignment] = verticalOffset,
                _a);
            // Center align when anchor width is comparable or greater than menu surface, otherwise keep corner.
            if (anchorSize.width / surfaceSize.width > numbers$5.ANCHOR_TO_MENU_SURFACE_WIDTH_RATIO) {
                horizontalAlignment = 'center';
            }
            // If the menu-surface has been hoisted to the body, it's no longer relative to the anchor element
            if (this.isHoistedElement_ || this.isFixedPosition_) {
                this.adjustPositionForHoistedElement_(position);
            }
            this.adapter_.setTransformOrigin(horizontalAlignment + " " + verticalAlignment);
            this.adapter_.setPosition(position);
            this.adapter_.setMaxHeight(maxMenuSurfaceHeight ? maxMenuSurfaceHeight + 'px' : '');
        };
        /**
         * @return Measurements used to position menu surface popup.
         */
        MDCMenuSurfaceFoundation.prototype.getAutoLayoutMeasurements_ = function () {
            var anchorRect = this.adapter_.getAnchorDimensions();
            var bodySize = this.adapter_.getBodyDimensions();
            var viewportSize = this.adapter_.getWindowDimensions();
            var windowScroll = this.adapter_.getWindowScroll();
            if (!anchorRect) {
                // tslint:disable:object-literal-sort-keys Positional properties are more readable when they're grouped together
                anchorRect = {
                    top: this.position_.y,
                    right: this.position_.x,
                    bottom: this.position_.y,
                    left: this.position_.x,
                    width: 0,
                    height: 0,
                };
                // tslint:enable:object-literal-sort-keys
            }
            return {
                anchorSize: anchorRect,
                bodySize: bodySize,
                surfaceSize: this.dimensions_,
                viewportDistance: {
                    // tslint:disable:object-literal-sort-keys Positional properties are more readable when they're grouped together
                    top: anchorRect.top,
                    right: viewportSize.width - anchorRect.right,
                    bottom: viewportSize.height - anchorRect.bottom,
                    left: anchorRect.left,
                },
                viewportSize: viewportSize,
                windowScroll: windowScroll,
            };
        };
        /**
         * Computes the corner of the anchor from which to animate and position the menu surface.
         */
        MDCMenuSurfaceFoundation.prototype.getOriginCorner_ = function () {
            // Defaults: open from the top left.
            var corner = Corner.TOP_LEFT;
            var _a = this.measurements_, viewportDistance = _a.viewportDistance, anchorSize = _a.anchorSize, surfaceSize = _a.surfaceSize;
            var isBottomAligned = this.hasBit_(this.anchorCorner_, CornerBit.BOTTOM);
            var availableTop = isBottomAligned ? viewportDistance.top + anchorSize.height + this.anchorMargin_.bottom
                : viewportDistance.top + this.anchorMargin_.top;
            var availableBottom = isBottomAligned ? viewportDistance.bottom - this.anchorMargin_.bottom
                : viewportDistance.bottom + anchorSize.height - this.anchorMargin_.top;
            var topOverflow = surfaceSize.height - availableTop;
            var bottomOverflow = surfaceSize.height - availableBottom;
            if (bottomOverflow > 0 && topOverflow < bottomOverflow) {
                corner = this.setBit_(corner, CornerBit.BOTTOM);
            }
            var isRtl = this.adapter_.isRtl();
            var isFlipRtl = this.hasBit_(this.anchorCorner_, CornerBit.FLIP_RTL);
            var avoidHorizontalOverlap = this.hasBit_(this.anchorCorner_, CornerBit.RIGHT);
            var isAlignedRight = (avoidHorizontalOverlap && !isRtl) ||
                (!avoidHorizontalOverlap && isFlipRtl && isRtl);
            var availableLeft = isAlignedRight ? viewportDistance.left + anchorSize.width + this.anchorMargin_.right :
                viewportDistance.left + this.anchorMargin_.left;
            var availableRight = isAlignedRight ? viewportDistance.right - this.anchorMargin_.right :
                viewportDistance.right + anchorSize.width - this.anchorMargin_.left;
            var leftOverflow = surfaceSize.width - availableLeft;
            var rightOverflow = surfaceSize.width - availableRight;
            if ((leftOverflow < 0 && isAlignedRight && isRtl) ||
                (avoidHorizontalOverlap && !isAlignedRight && leftOverflow < 0) ||
                (rightOverflow > 0 && leftOverflow < rightOverflow)) {
                corner = this.setBit_(corner, CornerBit.RIGHT);
            }
            return corner;
        };
        /**
         * @param corner Origin corner of the menu surface.
         * @return Maximum height of the menu surface, based on available space. 0 indicates should not be set.
         */
        MDCMenuSurfaceFoundation.prototype.getMenuSurfaceMaxHeight_ = function (corner) {
            var viewportDistance = this.measurements_.viewportDistance;
            var maxHeight = 0;
            var isBottomAligned = this.hasBit_(corner, CornerBit.BOTTOM);
            var isBottomAnchored = this.hasBit_(this.anchorCorner_, CornerBit.BOTTOM);
            var MARGIN_TO_EDGE = MDCMenuSurfaceFoundation.numbers.MARGIN_TO_EDGE;
            // When maximum height is not specified, it is handled from CSS.
            if (isBottomAligned) {
                maxHeight = viewportDistance.top + this.anchorMargin_.top - MARGIN_TO_EDGE;
                if (!isBottomAnchored) {
                    maxHeight += this.measurements_.anchorSize.height;
                }
            }
            else {
                maxHeight =
                    viewportDistance.bottom - this.anchorMargin_.bottom + this.measurements_.anchorSize.height - MARGIN_TO_EDGE;
                if (isBottomAnchored) {
                    maxHeight -= this.measurements_.anchorSize.height;
                }
            }
            return maxHeight;
        };
        /**
         * @param corner Origin corner of the menu surface.
         * @return Horizontal offset of menu surface origin corner from corresponding anchor corner.
         */
        MDCMenuSurfaceFoundation.prototype.getHorizontalOriginOffset_ = function (corner) {
            var anchorSize = this.measurements_.anchorSize;
            // isRightAligned corresponds to using the 'right' property on the surface.
            var isRightAligned = this.hasBit_(corner, CornerBit.RIGHT);
            var avoidHorizontalOverlap = this.hasBit_(this.anchorCorner_, CornerBit.RIGHT);
            if (isRightAligned) {
                var rightOffset = avoidHorizontalOverlap ? anchorSize.width - this.anchorMargin_.left : this.anchorMargin_.right;
                // For hoisted or fixed elements, adjust the offset by the difference between viewport width and body width so
                // when we calculate the right value (`adjustPositionForHoistedElement_`) based on the element position,
                // the right property is correct.
                if (this.isHoistedElement_ || this.isFixedPosition_) {
                    return rightOffset - (this.measurements_.viewportSize.width - this.measurements_.bodySize.width);
                }
                return rightOffset;
            }
            return avoidHorizontalOverlap ? anchorSize.width - this.anchorMargin_.right : this.anchorMargin_.left;
        };
        /**
         * @param corner Origin corner of the menu surface.
         * @return Vertical offset of menu surface origin corner from corresponding anchor corner.
         */
        MDCMenuSurfaceFoundation.prototype.getVerticalOriginOffset_ = function (corner) {
            var anchorSize = this.measurements_.anchorSize;
            var isBottomAligned = this.hasBit_(corner, CornerBit.BOTTOM);
            var avoidVerticalOverlap = this.hasBit_(this.anchorCorner_, CornerBit.BOTTOM);
            var y = 0;
            if (isBottomAligned) {
                y = avoidVerticalOverlap ? anchorSize.height - this.anchorMargin_.top : -this.anchorMargin_.bottom;
            }
            else {
                y = avoidVerticalOverlap ? (anchorSize.height + this.anchorMargin_.bottom) : this.anchorMargin_.top;
            }
            return y;
        };
        /** Calculates the offsets for positioning the menu-surface when the menu-surface has been hoisted to the body. */
        MDCMenuSurfaceFoundation.prototype.adjustPositionForHoistedElement_ = function (position) {
            var e_1, _a;
            var _b = this.measurements_, windowScroll = _b.windowScroll, viewportDistance = _b.viewportDistance;
            var props = Object.keys(position);
            try {
                for (var props_1 = __values(props), props_1_1 = props_1.next(); !props_1_1.done; props_1_1 = props_1.next()) {
                    var prop = props_1_1.value;
                    var value = position[prop] || 0;
                    // Hoisted surfaces need to have the anchor elements location on the page added to the
                    // position properties for proper alignment on the body.
                    value += viewportDistance[prop];
                    // Surfaces that are absolutely positioned need to have additional calculations for scroll
                    // and bottom positioning.
                    if (!this.isFixedPosition_) {
                        if (prop === 'top') {
                            value += windowScroll.y;
                        }
                        else if (prop === 'bottom') {
                            value -= windowScroll.y;
                        }
                        else if (prop === 'left') {
                            value += windowScroll.x;
                        }
                        else { // prop === 'right'
                            value -= windowScroll.x;
                        }
                    }
                    position[prop] = value;
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (props_1_1 && !props_1_1.done && (_a = props_1.return)) _a.call(props_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
        };
        /**
         * The last focused element when the menu surface was opened should regain focus, if the user is
         * focused on or within the menu surface when it is closed.
         */
        MDCMenuSurfaceFoundation.prototype.maybeRestoreFocus_ = function () {
            var isRootFocused = this.adapter_.isFocused();
            var childHasFocus = document.activeElement && this.adapter_.isElementInContainer(document.activeElement);
            if (isRootFocused || childHasFocus) {
                this.adapter_.restoreFocus();
            }
        };
        MDCMenuSurfaceFoundation.prototype.hasBit_ = function (corner, bit) {
            return Boolean(corner & bit); // tslint:disable-line:no-bitwise
        };
        MDCMenuSurfaceFoundation.prototype.setBit_ = function (corner, bit) {
            return corner | bit; // tslint:disable-line:no-bitwise
        };
        /**
         * isFinite that doesn't force conversion to number type.
         * Equivalent to Number.isFinite in ES2015, which is not supported in IE.
         */
        MDCMenuSurfaceFoundation.prototype.isFinite_ = function (num) {
            return typeof num === 'number' && isFinite(num);
        };
        return MDCMenuSurfaceFoundation;
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
    var cachedCssTransformPropertyName_;
    /**
     * Returns the name of the correct transform property to use on the current browser.
     */
    function getTransformPropertyName(globalObj, forceRefresh) {
        if (forceRefresh === void 0) { forceRefresh = false; }
        if (cachedCssTransformPropertyName_ === undefined || forceRefresh) {
            var el = globalObj.document.createElement('div');
            cachedCssTransformPropertyName_ = 'transform' in el.style ? 'transform' : 'webkitTransform';
        }
        return cachedCssTransformPropertyName_;
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
    var MDCMenuSurface = /** @class */ (function (_super) {
        __extends(MDCMenuSurface, _super);
        function MDCMenuSurface() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCMenuSurface.attachTo = function (root) {
            return new MDCMenuSurface(root);
        };
        MDCMenuSurface.prototype.initialSyncWithDOM = function () {
            var _this = this;
            var parentEl = this.root_.parentElement;
            this.anchorElement = parentEl && parentEl.classList.contains(cssClasses$9.ANCHOR) ? parentEl : null;
            if (this.root_.classList.contains(cssClasses$9.FIXED)) {
                this.setFixedPosition(true);
            }
            this.handleKeydown_ = function (evt) { return _this.foundation_.handleKeydown(evt); };
            this.handleBodyClick_ = function (evt) { return _this.foundation_.handleBodyClick(evt); };
            this.registerBodyClickListener_ = function () { return document.body.addEventListener('click', _this.handleBodyClick_); };
            this.deregisterBodyClickListener_ = function () { return document.body.removeEventListener('click', _this.handleBodyClick_); };
            this.listen('keydown', this.handleKeydown_);
            this.listen(strings$d.OPENED_EVENT, this.registerBodyClickListener_);
            this.listen(strings$d.CLOSED_EVENT, this.deregisterBodyClickListener_);
        };
        MDCMenuSurface.prototype.destroy = function () {
            this.unlisten('keydown', this.handleKeydown_);
            this.unlisten(strings$d.OPENED_EVENT, this.registerBodyClickListener_);
            this.unlisten(strings$d.CLOSED_EVENT, this.deregisterBodyClickListener_);
            _super.prototype.destroy.call(this);
        };
        Object.defineProperty(MDCMenuSurface.prototype, "open", {
            get: function () {
                return this.foundation_.isOpen();
            },
            set: function (value) {
                if (value) {
                    var focusableElements = this.root_.querySelectorAll(strings$d.FOCUSABLE_ELEMENTS);
                    this.firstFocusableElement_ = focusableElements[0];
                    this.lastFocusableElement_ = focusableElements[focusableElements.length - 1];
                    this.foundation_.open();
                }
                else {
                    this.foundation_.close();
                }
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenuSurface.prototype, "quickOpen", {
            set: function (quickOpen) {
                this.foundation_.setQuickOpen(quickOpen);
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Removes the menu-surface from it's current location and appends it to the
         * body to overcome any overflow:hidden issues.
         */
        MDCMenuSurface.prototype.hoistMenuToBody = function () {
            document.body.appendChild(this.root_);
            this.setIsHoisted(true);
        };
        /** Sets the foundation to use page offsets for an positioning when the menu is hoisted to the body. */
        MDCMenuSurface.prototype.setIsHoisted = function (isHoisted) {
            this.foundation_.setIsHoisted(isHoisted);
        };
        /** Sets the element that the menu-surface is anchored to. */
        MDCMenuSurface.prototype.setMenuSurfaceAnchorElement = function (element) {
            this.anchorElement = element;
        };
        /** Sets the menu-surface to position: fixed. */
        MDCMenuSurface.prototype.setFixedPosition = function (isFixed) {
            if (isFixed) {
                this.root_.classList.add(cssClasses$9.FIXED);
            }
            else {
                this.root_.classList.remove(cssClasses$9.FIXED);
            }
            this.foundation_.setFixedPosition(isFixed);
        };
        /** Sets the absolute x/y position to position based on. Requires the menu to be hoisted. */
        MDCMenuSurface.prototype.setAbsolutePosition = function (x, y) {
            this.foundation_.setAbsolutePosition(x, y);
            this.setIsHoisted(true);
        };
        /**
         * @param corner Default anchor corner alignment of top-left surface corner.
         */
        MDCMenuSurface.prototype.setAnchorCorner = function (corner) {
            this.foundation_.setAnchorCorner(corner);
        };
        MDCMenuSurface.prototype.setAnchorMargin = function (margin) {
            this.foundation_.setAnchorMargin(margin);
        };
        MDCMenuSurface.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                hasAnchor: function () { return !!_this.anchorElement; },
                notifyClose: function () { return _this.emit(MDCMenuSurfaceFoundation.strings.CLOSED_EVENT, {}); },
                notifyOpen: function () { return _this.emit(MDCMenuSurfaceFoundation.strings.OPENED_EVENT, {}); },
                isElementInContainer: function (el) { return _this.root_.contains(el); },
                isRtl: function () { return getComputedStyle(_this.root_).getPropertyValue('direction') === 'rtl'; },
                setTransformOrigin: function (origin) {
                    var propertyName = getTransformPropertyName(window) + "-origin";
                    _this.root_.style.setProperty(propertyName, origin);
                },
                isFocused: function () { return document.activeElement === _this.root_; },
                saveFocus: function () {
                    _this.previousFocus_ = document.activeElement;
                },
                restoreFocus: function () {
                    if (_this.root_.contains(document.activeElement)) {
                        if (_this.previousFocus_ && _this.previousFocus_.focus) {
                            _this.previousFocus_.focus();
                        }
                    }
                },
                isFirstElementFocused: function () {
                    return _this.firstFocusableElement_ ? _this.firstFocusableElement_ === document.activeElement : false;
                },
                isLastElementFocused: function () {
                    return _this.lastFocusableElement_ ? _this.lastFocusableElement_ === document.activeElement : false;
                },
                focusFirstElement: function () {
                    return _this.firstFocusableElement_ && _this.firstFocusableElement_.focus && _this.firstFocusableElement_.focus();
                },
                focusLastElement: function () {
                    return _this.lastFocusableElement_ && _this.lastFocusableElement_.focus && _this.lastFocusableElement_.focus();
                },
                getInnerDimensions: function () {
                    return { width: _this.root_.offsetWidth, height: _this.root_.offsetHeight };
                },
                getAnchorDimensions: function () { return _this.anchorElement ? _this.anchorElement.getBoundingClientRect() : null; },
                getWindowDimensions: function () {
                    return { width: window.innerWidth, height: window.innerHeight };
                },
                getBodyDimensions: function () {
                    return { width: document.body.clientWidth, height: document.body.clientHeight };
                },
                getWindowScroll: function () {
                    return { x: window.pageXOffset, y: window.pageYOffset };
                },
                setPosition: function (position) {
                    _this.root_.style.left = 'left' in position ? position.left + "px" : '';
                    _this.root_.style.right = 'right' in position ? position.right + "px" : '';
                    _this.root_.style.top = 'top' in position ? position.top + "px" : '';
                    _this.root_.style.bottom = 'bottom' in position ? position.bottom + "px" : '';
                },
                setMaxHeight: function (height) {
                    _this.root_.style.maxHeight = height;
                },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCMenuSurfaceFoundation(adapter);
        };
        return MDCMenuSurface;
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
    var cssClasses$a = {
        MENU_SELECTED_LIST_ITEM: 'mdc-menu-item--selected',
        MENU_SELECTION_GROUP: 'mdc-menu__selection-group',
        ROOT: 'mdc-menu',
    };
    var strings$e = {
        ARIA_SELECTED_ATTR: 'aria-selected',
        CHECKBOX_SELECTOR: 'input[type="checkbox"]',
        LIST_SELECTOR: '.mdc-list',
        SELECTED_EVENT: 'MDCMenu:selected',
    };
    var numbers$6 = {
        FOCUS_ROOT_INDEX: -1,
    };
    var DefaultFocusState;
    (function (DefaultFocusState) {
        DefaultFocusState[DefaultFocusState["NONE"] = 0] = "NONE";
        DefaultFocusState[DefaultFocusState["LIST_ROOT"] = 1] = "LIST_ROOT";
        DefaultFocusState[DefaultFocusState["FIRST_ITEM"] = 2] = "FIRST_ITEM";
        DefaultFocusState[DefaultFocusState["LAST_ITEM"] = 3] = "LAST_ITEM";
    })(DefaultFocusState || (DefaultFocusState = {}));

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
    var MDCMenuFoundation = /** @class */ (function (_super) {
        __extends(MDCMenuFoundation, _super);
        function MDCMenuFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCMenuFoundation.defaultAdapter, adapter)) || this;
            _this.closeAnimationEndTimerId_ = 0;
            _this.defaultFocusState_ = DefaultFocusState.LIST_ROOT;
            return _this;
        }
        Object.defineProperty(MDCMenuFoundation, "cssClasses", {
            get: function () {
                return cssClasses$a;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenuFoundation, "strings", {
            get: function () {
                return strings$e;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenuFoundation, "numbers", {
            get: function () {
                return numbers$6;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenuFoundation, "defaultAdapter", {
            /**
             * @see {@link MDCMenuAdapter} for typing information on parameters and return types.
             */
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClassToElementAtIndex: function () { return undefined; },
                    removeClassFromElementAtIndex: function () { return undefined; },
                    addAttributeToElementAtIndex: function () { return undefined; },
                    removeAttributeFromElementAtIndex: function () { return undefined; },
                    elementContainsClass: function () { return false; },
                    closeSurface: function () { return undefined; },
                    getElementIndex: function () { return -1; },
                    getParentElement: function () { return null; },
                    getSelectedElementIndex: function () { return -1; },
                    notifySelected: function () { return undefined; },
                    getMenuItemCount: function () { return 0; },
                    focusItemAtIndex: function () { return undefined; },
                    focusListRoot: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCMenuFoundation.prototype.destroy = function () {
            if (this.closeAnimationEndTimerId_) {
                clearTimeout(this.closeAnimationEndTimerId_);
            }
            this.adapter_.closeSurface();
        };
        MDCMenuFoundation.prototype.handleKeydown = function (evt) {
            var key = evt.key, keyCode = evt.keyCode;
            var isTab = key === 'Tab' || keyCode === 9;
            if (isTab) {
                this.adapter_.closeSurface();
            }
        };
        MDCMenuFoundation.prototype.handleItemAction = function (listItem) {
            var _this = this;
            var index = this.adapter_.getElementIndex(listItem);
            if (index < 0) {
                return;
            }
            this.adapter_.notifySelected({ index: index });
            this.adapter_.closeSurface();
            // Wait for the menu to close before adding/removing classes that affect styles.
            this.closeAnimationEndTimerId_ = setTimeout(function () {
                var selectionGroup = _this.getSelectionGroup_(listItem);
                if (selectionGroup) {
                    _this.handleSelectionGroup_(selectionGroup, index);
                }
            }, MDCMenuSurfaceFoundation.numbers.TRANSITION_CLOSE_DURATION);
        };
        MDCMenuFoundation.prototype.handleMenuSurfaceOpened = function () {
            switch (this.defaultFocusState_) {
                case DefaultFocusState.FIRST_ITEM:
                    this.adapter_.focusItemAtIndex(0);
                    break;
                case DefaultFocusState.LAST_ITEM:
                    this.adapter_.focusItemAtIndex(this.adapter_.getMenuItemCount() - 1);
                    break;
                case DefaultFocusState.NONE:
                    // Do nothing.
                    break;
                default:
                    this.adapter_.focusListRoot();
                    break;
            }
        };
        /**
         * Sets default focus state where the menu should focus every time when menu
         * is opened. Focuses the list root (`DefaultFocusState.LIST_ROOT`) element by
         * default.
         */
        MDCMenuFoundation.prototype.setDefaultFocusState = function (focusState) {
            this.defaultFocusState_ = focusState;
        };
        /**
         * Handles toggling the selected classes in a selection group when a selection is made.
         */
        MDCMenuFoundation.prototype.handleSelectionGroup_ = function (selectionGroup, index) {
            // De-select the previous selection in this group.
            var selectedIndex = this.adapter_.getSelectedElementIndex(selectionGroup);
            if (selectedIndex >= 0) {
                this.adapter_.removeAttributeFromElementAtIndex(selectedIndex, strings$e.ARIA_SELECTED_ATTR);
                this.adapter_.removeClassFromElementAtIndex(selectedIndex, cssClasses$a.MENU_SELECTED_LIST_ITEM);
            }
            // Select the new list item in this group.
            this.adapter_.addClassToElementAtIndex(index, cssClasses$a.MENU_SELECTED_LIST_ITEM);
            this.adapter_.addAttributeToElementAtIndex(index, strings$e.ARIA_SELECTED_ATTR, 'true');
        };
        /**
         * Returns the parent selection group of an element if one exists.
         */
        MDCMenuFoundation.prototype.getSelectionGroup_ = function (listItem) {
            var parent = this.adapter_.getParentElement(listItem);
            if (!parent) {
                return null;
            }
            var isGroup = this.adapter_.elementContainsClass(parent, cssClasses$a.MENU_SELECTION_GROUP);
            // Iterate through ancestors until we find the group or get to the list.
            while (!isGroup && parent && !this.adapter_.elementContainsClass(parent, MDCListFoundation.cssClasses.ROOT)) {
                parent = this.adapter_.getParentElement(parent);
                isGroup = parent ? this.adapter_.elementContainsClass(parent, cssClasses$a.MENU_SELECTION_GROUP) : false;
            }
            if (isGroup) {
                return parent;
            }
            else {
                return null;
            }
        };
        return MDCMenuFoundation;
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
    var MDCMenu = /** @class */ (function (_super) {
        __extends(MDCMenu, _super);
        function MDCMenu() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCMenu.attachTo = function (root) {
            return new MDCMenu(root);
        };
        MDCMenu.prototype.initialize = function (menuSurfaceFactory, listFactory) {
            if (menuSurfaceFactory === void 0) { menuSurfaceFactory = function (el) { return new MDCMenuSurface(el); }; }
            if (listFactory === void 0) { listFactory = function (el) { return new MDCList(el); }; }
            this.menuSurfaceFactory_ = menuSurfaceFactory;
            this.listFactory_ = listFactory;
        };
        MDCMenu.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.menuSurface_ = this.menuSurfaceFactory_(this.root_);
            var list = this.root_.querySelector(strings$e.LIST_SELECTOR);
            if (list) {
                this.list_ = this.listFactory_(list);
                this.list_.wrapFocus = true;
            }
            else {
                this.list_ = null;
            }
            this.handleKeydown_ = function (evt) { return _this.foundation_.handleKeydown(evt); };
            this.handleItemAction_ = function (evt) { return _this.foundation_.handleItemAction(_this.items[evt.detail.index]); };
            this.handleMenuSurfaceOpened_ = function () { return _this.foundation_.handleMenuSurfaceOpened(); };
            this.menuSurface_.listen(MDCMenuSurfaceFoundation.strings.OPENED_EVENT, this.handleMenuSurfaceOpened_);
            this.listen('keydown', this.handleKeydown_);
            this.listen(MDCListFoundation.strings.ACTION_EVENT, this.handleItemAction_);
        };
        MDCMenu.prototype.destroy = function () {
            if (this.list_) {
                this.list_.destroy();
            }
            this.menuSurface_.destroy();
            this.menuSurface_.unlisten(MDCMenuSurfaceFoundation.strings.OPENED_EVENT, this.handleMenuSurfaceOpened_);
            this.unlisten('keydown', this.handleKeydown_);
            this.unlisten(MDCListFoundation.strings.ACTION_EVENT, this.handleItemAction_);
            _super.prototype.destroy.call(this);
        };
        Object.defineProperty(MDCMenu.prototype, "open", {
            get: function () {
                return this.menuSurface_.open;
            },
            set: function (value) {
                this.menuSurface_.open = value;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenu.prototype, "wrapFocus", {
            get: function () {
                return this.list_ ? this.list_.wrapFocus : false;
            },
            set: function (value) {
                if (this.list_) {
                    this.list_.wrapFocus = value;
                }
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenu.prototype, "items", {
            /**
             * Return the items within the menu. Note that this only contains the set of elements within
             * the items container that are proper list items, and not supplemental / presentational DOM
             * elements.
             */
            get: function () {
                return this.list_ ? this.list_.listElements : [];
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCMenu.prototype, "quickOpen", {
            set: function (quickOpen) {
                this.menuSurface_.quickOpen = quickOpen;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Sets default focus state where the menu should focus every time when menu
         * is opened. Focuses the list root (`DefaultFocusState.LIST_ROOT`) element by
         * default.
         * @param focusState Default focus state.
         */
        MDCMenu.prototype.setDefaultFocusState = function (focusState) {
            this.foundation_.setDefaultFocusState(focusState);
        };
        /**
         * @param corner Default anchor corner alignment of top-left menu corner.
         */
        MDCMenu.prototype.setAnchorCorner = function (corner) {
            this.menuSurface_.setAnchorCorner(corner);
        };
        MDCMenu.prototype.setAnchorMargin = function (margin) {
            this.menuSurface_.setAnchorMargin(margin);
        };
        /**
         * @return The item within the menu at the index specified.
         */
        MDCMenu.prototype.getOptionByIndex = function (index) {
            var items = this.items;
            if (index < items.length) {
                return this.items[index];
            }
            else {
                return null;
            }
        };
        MDCMenu.prototype.setFixedPosition = function (isFixed) {
            this.menuSurface_.setFixedPosition(isFixed);
        };
        MDCMenu.prototype.hoistMenuToBody = function () {
            this.menuSurface_.hoistMenuToBody();
        };
        MDCMenu.prototype.setIsHoisted = function (isHoisted) {
            this.menuSurface_.setIsHoisted(isHoisted);
        };
        MDCMenu.prototype.setAbsolutePosition = function (x, y) {
            this.menuSurface_.setAbsolutePosition(x, y);
        };
        /**
         * Sets the element that the menu-surface is anchored to.
         */
        MDCMenu.prototype.setAnchorElement = function (element) {
            this.menuSurface_.anchorElement = element;
        };
        MDCMenu.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                addClassToElementAtIndex: function (index, className) {
                    var list = _this.items;
                    list[index].classList.add(className);
                },
                removeClassFromElementAtIndex: function (index, className) {
                    var list = _this.items;
                    list[index].classList.remove(className);
                },
                addAttributeToElementAtIndex: function (index, attr, value) {
                    var list = _this.items;
                    list[index].setAttribute(attr, value);
                },
                removeAttributeFromElementAtIndex: function (index, attr) {
                    var list = _this.items;
                    list[index].removeAttribute(attr);
                },
                elementContainsClass: function (element, className) { return element.classList.contains(className); },
                closeSurface: function () { return _this.open = false; },
                getElementIndex: function (element) { return _this.items.indexOf(element); },
                getParentElement: function (element) { return element.parentElement; },
                getSelectedElementIndex: function (selectionGroup) {
                    var selectedListItem = selectionGroup.querySelector("." + cssClasses$a.MENU_SELECTED_LIST_ITEM);
                    return selectedListItem ? _this.items.indexOf(selectedListItem) : -1;
                },
                notifySelected: function (evtData) { return _this.emit(strings$e.SELECTED_EVENT, {
                    index: evtData.index,
                    item: _this.items[evtData.index],
                }); },
                getMenuItemCount: function () { return _this.items.length; },
                focusItemAtIndex: function (index) { return _this.items[index].focus(); },
                focusListRoot: function () { return _this.root_.querySelector(strings$e.LIST_SELECTOR).focus(); },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCMenuFoundation(adapter);
        };
        return MDCMenu;
    }(MDCComponent));

    /* src\components\Menu\Menu.svelte generated by Svelte v3.6.1 */
    const { console: console_1$2 } = globals;

    const file$m = "src\\components\\Menu\\Menu.svelte";

    // (74:2) <List as="ul" role="menu" aria-hidden="true">
    function create_default_slot(ctx) {
    	var current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},

    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$m(ctx) {
    	var div, current;

    	var list = new List({
    		props: {
    		as: "ul",
    		role: "menu",
    		"aria-hidden": "true",
    		$$slots: { default: [create_default_slot] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			div = element("div");
    			list.$$.fragment.c();
    			attr(div, "tabindex", "-1");
    			attr(div, "class", "mdc-menu mdc-menu-surface");
    			add_location(div, file$m, 72, 0, 1573);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(list, div, null);
    			add_binding_callback(() => ctx.div_binding(div, null));
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var list_changes = {};
    			if (changed.$$scope) list_changes.$$scope = { changed, ctx };
    			list.$set(list_changes);

    			if (changed.items) {
    				ctx.div_binding(null, div);
    				ctx.div_binding(div, null);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(list.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(list.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			destroy_component(list, );

    			ctx.div_binding(null, div);
    		}
    	};
    }

    let Corner$1 = Corner;

    function instance$m($$self, $$props, $$invalidate) {
    	

      const dispatch = createEventDispatcher();

      let { menu = null, open = false, quickOpen = false, selected = null, anchorCorner = null, anchorMargin = null } = $$props;

      let mdcComponent;

      onMount(() => {
        $$invalidate('mdcComponent', mdcComponent = new MDCMenu(menu));
        mdcComponent.listen("MDCMenu:selected", obj => {
          dispatch("selected", obj);
          $$invalidate('selected', selected = obj.detail.index);
          $$invalidate('open', open = false);
          console.log('MDCMenu:selected', obj.detail);
        });
      });

      onDestroy(() => {
        mdcComponent && mdcComponent.destroy();
      });

      function showItem(number) {
        mdcComponent.show(number);
      }

      function show(isOpen) {
        if (mdcComponent.open !== open) {
          mdcComponent.open = open; $$invalidate('mdcComponent', mdcComponent), $$invalidate('open', open), $$invalidate('quickOpen', quickOpen);
        }    
        $$invalidate('open', open = isOpen);
      }

    	const writable_props = ['menu', 'open', 'quickOpen', 'selected', 'anchorCorner', 'anchorMargin'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1$2.warn(`<Menu> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$node, check) {
    		menu = $$node;
    		$$invalidate('menu', menu);
    	}

    	$$self.$set = $$props => {
    		if ('menu' in $$props) $$invalidate('menu', menu = $$props.menu);
    		if ('open' in $$props) $$invalidate('open', open = $$props.open);
    		if ('quickOpen' in $$props) $$invalidate('quickOpen', quickOpen = $$props.quickOpen);
    		if ('selected' in $$props) $$invalidate('selected', selected = $$props.selected);
    		if ('anchorCorner' in $$props) $$invalidate('anchorCorner', anchorCorner = $$props.anchorCorner);
    		if ('anchorMargin' in $$props) $$invalidate('anchorMargin', anchorMargin = $$props.anchorMargin);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { mdcComponent: 1, open: 1, quickOpen: 1, anchorCorner: 1, Corner: 1, anchorMargin: 1 }) => {
    		if ($$dirty.mdcComponent || $$dirty.open) { if (mdcComponent) {
            mdcComponent.open = open; $$invalidate('mdcComponent', mdcComponent), $$invalidate('open', open), $$invalidate('quickOpen', quickOpen);
            console.log('mdcComponent.open', open);
          } }
    		if ($$dirty.mdcComponent || $$dirty.quickOpen) { if (mdcComponent) {
            mdcComponent.quickOpen = quickOpen; $$invalidate('mdcComponent', mdcComponent), $$invalidate('open', open), $$invalidate('quickOpen', quickOpen);
          } }
    		if ($$dirty.mdcComponent || $$dirty.anchorCorner || $$dirty.Corner) { if (mdcComponent) {
            if (anchorCorner) {
              mdcComponent.setAnchorCorner(Corner$1[anchorCorner.toUpperCase()]);
            } else {
              mdcComponent.setAnchorCorner(Corner$1.TOP_START);
            }
          } }
    		if ($$dirty.mdcComponent || $$dirty.anchorMargin) { if (mdcComponent && anchorMargin) {
            mdcComponent.setAnchorMargin(anchorMargin);
          } }
    	};

    	return {
    		menu,
    		open,
    		quickOpen,
    		selected,
    		anchorCorner,
    		anchorMargin,
    		showItem,
    		show,
    		div_binding,
    		$$slots,
    		$$scope
    	};
    }

    class Menu extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$m, create_fragment$m, safe_not_equal, ["menu", "open", "quickOpen", "selected", "anchorCorner", "anchorMargin", "showItem", "show"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.showItem === undefined && !('showItem' in props)) {
    			console_1$2.warn("<Menu> was created without expected prop 'showItem'");
    		}
    		if (ctx.show === undefined && !('show' in props)) {
    			console_1$2.warn("<Menu> was created without expected prop 'show'");
    		}
    	}

    	get menu() {
    		throw new Error("<Menu>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set menu(value) {
    		throw new Error("<Menu>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get open() {
    		throw new Error("<Menu>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set open(value) {
    		throw new Error("<Menu>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get quickOpen() {
    		throw new Error("<Menu>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set quickOpen(value) {
    		throw new Error("<Menu>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selected() {
    		throw new Error("<Menu>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selected(value) {
    		throw new Error("<Menu>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get anchorCorner() {
    		throw new Error("<Menu>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set anchorCorner(value) {
    		throw new Error("<Menu>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get anchorMargin() {
    		throw new Error("<Menu>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set anchorMargin(value) {
    		throw new Error("<Menu>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showItem() {
    		return this.$$.ctx.showItem;
    	}

    	set showItem(value) {
    		throw new Error("<Menu>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get show() {
    		return this.$$.ctx.show;
    	}

    	set show(value) {
    		throw new Error("<Menu>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Menu\MenuItem.svelte generated by Svelte v3.6.1 */

    // (32:0) <ListItem {...attrs}>
    function create_default_slot$1(ctx) {
    	var current;

    	const default_slot_1 = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_1, ctx, null);

    	return {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},

    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$n(ctx) {
    	var current;

    	var listitem_spread_levels = [
    		ctx.attrs
    	];

    	let listitem_props = {
    		$$slots: { default: [create_default_slot$1] },
    		$$scope: { ctx }
    	};
    	for (var i = 0; i < listitem_spread_levels.length; i += 1) {
    		listitem_props = assign(listitem_props, listitem_spread_levels[i]);
    	}
    	var listitem = new ListItem({ props: listitem_props, $$inline: true });

    	return {
    		c: function create() {
    			listitem.$$.fragment.c();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			mount_component(listitem, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var listitem_changes = changed.attrs ? get_spread_update(listitem_spread_levels, [
    				ctx.attrs
    			]) : {};
    			if (changed.$$scope) listitem_changes.$$scope = { changed, ctx };
    			listitem.$set(listitem_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(listitem.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(listitem.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(listitem, detaching);
    		}
    	};
    }

    function instance$n($$self, $$props, $$invalidate) {
    	let { showMeta = false, showGraphic = false } = $$props;

      let { attrs } = $$props;

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate('$$props', $$props = assign(assign({}, $$props), $$new_props));
    		if ('showMeta' in $$new_props) $$invalidate('showMeta', showMeta = $$new_props.showMeta);
    		if ('showGraphic' in $$new_props) $$invalidate('showGraphic', showGraphic = $$new_props.showGraphic);
    		if ('attrs' in $$new_props) $$invalidate('attrs', attrs = $$new_props.attrs);
    		if ('$$scope' in $$new_props) $$invalidate('$$scope', $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { $$props: 1 }) => {
    		{
            const classes = [];
            let result = Object.assign({ role: "menuitem" }, $$props);
            if (result.disabled) {
              result.tabindex = "-1";
              result["aria-disabled"] = "true";
            }
            for (let key of [
              "selected",
              "disabled",
              "activated",
              "primaryText",
              "secondText",
              "showGraphic",
              "showMeta"
            ]) {
              delete result[key];
            }
            result["class"] = processClasses(classes, result["class"]);
            $$invalidate('attrs', attrs = result);
          }
    	};

    	return {
    		showMeta,
    		showGraphic,
    		attrs,
    		$$props: $$props = exclude_internal_props($$props),
    		$$slots,
    		$$scope
    	};
    }

    class MenuItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$n, create_fragment$n, safe_not_equal, ["showMeta", "showGraphic", "attrs"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.attrs === undefined && !('attrs' in props)) {
    			console.warn("<MenuItem> was created without expected prop 'attrs'");
    		}
    	}

    	get showMeta() {
    		throw new Error("<MenuItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showMeta(value) {
    		throw new Error("<MenuItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showGraphic() {
    		throw new Error("<MenuItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showGraphic(value) {
    		throw new Error("<MenuItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get attrs() {
    		throw new Error("<MenuItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set attrs(value) {
    		throw new Error("<MenuItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\App.svelte generated by Svelte v3.6.1 */
    const { console: console_1$3 } = globals;

    const file$n = "src\\App.svelte";

    // (38:1) <Display level="2" adjustMargin>
    function create_default_slot_62(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("svelte-mdc");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (40:1) <Headline adjustMargin>
    function create_default_slot_61(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text(ctx.name);
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (changed.name) {
    				set_data(t, ctx.name);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (42:1) <Title>
    function create_default_slot_60(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Buttons");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (43:1) <Button icon="build" raised href="#">
    function create_default_slot_59(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Build me!");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (44:1) <Button icon="grade" unelevated background="secondary-dark">
    function create_default_slot_58(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Grade me!");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (45:1) <Button icon="cake" color="secondary-dark">
    function create_default_slot_57(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Eat me!");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (46:1) <Button icon="ac_unit" unelevated dense disabled>
    function create_default_slot_56(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Disable me!");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (47:1) <Button icon="build" raised compact href="#">
    function create_default_slot_55(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Build me!");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (48:1) <Button icon="grade" stroked type="submit">
    function create_default_slot_54(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Grade me!");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (50:1) <Title>
    function create_default_slot_53(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Floating action buttons");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (52:2) <LayoutGridCell span="12">
    function create_default_slot_52(ctx) {
    	var t0, t1, t2, current;

    	var fab0 = new Fab({
    		props: { icon: "add", background: "primary" },
    		$$inline: true
    	});

    	var fab1 = new Fab({
    		props: { icon: "star", mini: true },
    		$$inline: true
    	});

    	var fab2 = new Fab({
    		props: { icon: "school", background: "secondary" },
    		$$inline: true
    	});

    	var fab3 = new Fab({
    		props: {
    		icon: "add",
    		label: "Create",
    		extended: true,
    		ripple: true
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			fab0.$$.fragment.c();
    			t0 = space();
    			fab1.$$.fragment.c();
    			t1 = space();
    			fab2.$$.fragment.c();
    			t2 = space();
    			fab3.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(fab0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(fab1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(fab2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(fab3, target, anchor);
    			current = true;
    		},

    		p: noop,

    		i: function intro(local) {
    			if (current) return;
    			transition_in(fab0.$$.fragment, local);

    			transition_in(fab1.$$.fragment, local);

    			transition_in(fab2.$$.fragment, local);

    			transition_in(fab3.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(fab0.$$.fragment, local);
    			transition_out(fab1.$$.fragment, local);
    			transition_out(fab2.$$.fragment, local);
    			transition_out(fab3.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(fab0, detaching);

    			if (detaching) {
    				detach(t0);
    			}

    			destroy_component(fab1, detaching);

    			if (detaching) {
    				detach(t1);
    			}

    			destroy_component(fab2, detaching);

    			if (detaching) {
    				detach(t2);
    			}

    			destroy_component(fab3, detaching);
    		}
    	};
    }

    // (51:1) <LayoutGridInner>
    function create_default_slot_51(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		span: "12",
    		$$slots: { default: [create_default_slot_52] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (60:1) <Subheading level="2">
    function create_default_slot_50(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Subheading level 2");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (62:1) <Body>
    function create_default_slot_49(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Material Components for the web (MDC-Web) helps developers execute Material Design. Developed by a core team of engineers and UX designers at Google, these components enable a reliable development workflow to build beautiful and functional web projects.");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (66:1) <Title>
    function create_default_slot_48(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Cards");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (70:23) <Title>
    function create_default_slot_47(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Title");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (70:4) <span slot="title">
    function create_title_slot(ctx) {
    	var span, current;

    	var title = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_47] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			span = element("span");
    			title.$$.fragment.c();
    			attr(span, "slot", "title");
    			add_location(span, file$n, 69, 4, 2085);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			mount_component(title, span, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var title_changes = {};
    			if (changed.$$scope) title_changes.$$scope = { changed, ctx };
    			title.$set(title_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(title.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(title.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			destroy_component(title, );
    		}
    	};
    }

    // (71:26) <Subheading level="1">
    function create_default_slot_46(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Subtitle");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (71:4) <span slot="subtitle">
    function create_subtitle_slot(ctx) {
    	var span, current;

    	var subheading = new Subheading({
    		props: {
    		level: "1",
    		$$slots: { default: [create_default_slot_46] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			span = element("span");
    			subheading.$$.fragment.c();
    			attr(span, "slot", "subtitle");
    			add_location(span, file$n, 70, 4, 2137);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			mount_component(subheading, span, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var subheading_changes = {};
    			if (changed.$$scope) subheading_changes.$$scope = { changed, ctx };
    			subheading.$set(subheading_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(subheading.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(subheading.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			destroy_component(subheading, );
    		}
    	};
    }

    // (73:5) <Body level="1">
    function create_default_slot_45(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (72:4) <span slot="supportingText">
    function create_supportingText_slot(ctx) {
    	var span, current;

    	var body = new Body({
    		props: {
    		level: "1",
    		$$slots: { default: [create_default_slot_45] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			span = element("span");
    			body.$$.fragment.c();
    			attr(span, "slot", "supportingText");
    			add_location(span, file$n, 71, 4, 2215);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			mount_component(body, span, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var body_changes = {};
    			if (changed.$$scope) body_changes.$$scope = { changed, ctx };
    			body.$set(body_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(body.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(body.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			destroy_component(body, );
    		}
    	};
    }

    // (78:5) <Button href="https://github.com/matsp/material-components-vue/blob/master/components/Card">
    function create_default_slot_44(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("github");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (77:4) <span slot="actions">
    function create_actions_slot(ctx) {
    	var span, current;

    	var button = new Button({
    		props: {
    		href: "https://github.com/matsp/material-components-vue/blob/master/components/Card",
    		$$slots: { default: [create_default_slot_44] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			span = element("span");
    			button.$$.fragment.c();
    			attr(span, "slot", "actions");
    			add_location(span, file$n, 76, 4, 2641);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			mount_component(button, span, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var button_changes = {};
    			if (changed.$$scope) button_changes.$$scope = { changed, ctx };
    			button.$set(button_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			destroy_component(button, );
    		}
    	};
    }

    // (69:3) <Card ripple>
    function create_default_slot_43(ctx) {
    	var t0, t1, t2;

    	return {
    		c: function create() {
    			t0 = space();
    			t1 = space();
    			t2 = space();
    		},

    		m: function mount(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, t2, anchor);
    		},

    		p: noop,
    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t0);
    				detach(t1);
    				detach(t2);
    			}
    		}
    	};
    }

    // (68:2) <LayoutGridCell span="6">
    function create_default_slot_42(ctx) {
    	var current;

    	var card = new Card({
    		props: {
    		ripple: true,
    		$$slots: {
    		default: [create_default_slot_43],
    		actions: [create_actions_slot],
    		supportingText: [create_supportingText_slot],
    		subtitle: [create_subtitle_slot],
    		title: [create_title_slot]
    	},
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			card.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(card, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var card_changes = {};
    			if (changed.$$scope) card_changes.$$scope = { changed, ctx };
    			card.$set(card_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(card.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(card.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(card, detaching);
    		}
    	};
    }

    // (67:1) <LayoutGridInner>
    function create_default_slot_41(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		span: "6",
    		$$slots: { default: [create_default_slot_42] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (86:1) <Title>
    function create_default_slot_40(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Checkboxes");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (88:2) <LayoutGridCell span="1">
    function create_default_slot_39(ctx) {
    	var current;

    	var checkbox = new Checkbox({
    		props: { checked: ctx.checkboxValue },
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			checkbox.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(checkbox, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var checkbox_changes = {};
    			if (changed.checkboxValue) checkbox_changes.checked = ctx.checkboxValue;
    			checkbox.$set(checkbox_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(checkbox.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(checkbox.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(checkbox, detaching);
    		}
    	};
    }

    // (87:1) <LayoutGridInner>
    function create_default_slot_38(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		span: "1",
    		$$slots: { default: [create_default_slot_39] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope || changed.checkboxValue) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (93:1) <Title>
    function create_default_slot_37(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Menus");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (97:4) <Button on:click={showMenu} icon="build" raised>
    function create_default_slot_36(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Open Menu");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (99:5) <MenuItem>
    function create_default_slot_35(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("A Menu Item");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (100:5) <MenuItem>
    function create_default_slot_34(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Another Menu Item");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (98:4) <Menu bind:this={menu}>
    function create_default_slot_33(ctx) {
    	var t, current;

    	var menuitem0 = new MenuItem({
    		props: {
    		$$slots: { default: [create_default_slot_35] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var menuitem1 = new MenuItem({
    		props: {
    		$$slots: { default: [create_default_slot_34] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			menuitem0.$$.fragment.c();
    			t = space();
    			menuitem1.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(menuitem0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(menuitem1, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var menuitem0_changes = {};
    			if (changed.$$scope) menuitem0_changes.$$scope = { changed, ctx };
    			menuitem0.$set(menuitem0_changes);

    			var menuitem1_changes = {};
    			if (changed.$$scope) menuitem1_changes.$$scope = { changed, ctx };
    			menuitem1.$set(menuitem1_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(menuitem0.$$.fragment, local);

    			transition_in(menuitem1.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(menuitem0.$$.fragment, local);
    			transition_out(menuitem1.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(menuitem0, detaching);

    			if (detaching) {
    				detach(t);
    			}

    			destroy_component(menuitem1, detaching);
    		}
    	};
    }

    // (95:2) <LayoutGridCell span="6">
    function create_default_slot_32(ctx) {
    	var div, t, current;

    	var button = new Button({
    		props: {
    		icon: "build",
    		raised: true,
    		$$slots: { default: [create_default_slot_36] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button.$on("click", ctx.showMenu);

    	let menu_1_props = {
    		$$slots: { default: [create_default_slot_33] },
    		$$scope: { ctx }
    	};
    	var menu_1 = new Menu({ props: menu_1_props, $$inline: true });

    	add_binding_callback(() => ctx.menu_1_binding(menu_1));

    	return {
    		c: function create() {
    			div = element("div");
    			button.$$.fragment.c();
    			t = space();
    			menu_1.$$.fragment.c();
    			attr(div, "id", "demo-menu");
    			attr(div, "class", "mdc-menu-surface--anchor");
    			add_location(div, file$n, 95, 3, 3101);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(button, div, null);
    			append(div, t);
    			mount_component(menu_1, div, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var button_changes = {};
    			if (changed.$$scope) button_changes.$$scope = { changed, ctx };
    			button.$set(button_changes);

    			var menu_1_changes = {};
    			if (changed.$$scope) menu_1_changes.$$scope = { changed, ctx };
    			menu_1.$set(menu_1_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);

    			transition_in(menu_1.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			transition_out(menu_1.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			destroy_component(button, );

    			ctx.menu_1_binding(null);

    			destroy_component(menu_1, );
    		}
    	};
    }

    // (94:1) <LayoutGridInner>
    function create_default_slot_31(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		span: "6",
    		$$slots: { default: [create_default_slot_32] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope || changed.menu) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (106:1) <Title>
    function create_default_slot_30(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Tabs");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (111:5) <Tab href="#access_time" icon="access_time" active >
    function create_default_slot_29(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Recents");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (114:5) <Tab href="#near_me" icon="near_me" >
    function create_default_slot_28(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Near By");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (117:5) <Tab href="#favorite" icon="favorite" >
    function create_default_slot_27(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Favorites");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (110:4) <TabScroller>
    function create_default_slot_26(ctx) {
    	var t0, t1, current;

    	var tab0 = new Tab({
    		props: {
    		href: "#access_time",
    		icon: "access_time",
    		active: true,
    		$$slots: { default: [create_default_slot_29] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var tab1 = new Tab({
    		props: {
    		href: "#near_me",
    		icon: "near_me",
    		$$slots: { default: [create_default_slot_28] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var tab2 = new Tab({
    		props: {
    		href: "#favorite",
    		icon: "favorite",
    		$$slots: { default: [create_default_slot_27] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			tab0.$$.fragment.c();
    			t0 = space();
    			tab1.$$.fragment.c();
    			t1 = space();
    			tab2.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(tab0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(tab1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(tab2, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var tab0_changes = {};
    			if (changed.$$scope) tab0_changes.$$scope = { changed, ctx };
    			tab0.$set(tab0_changes);

    			var tab1_changes = {};
    			if (changed.$$scope) tab1_changes.$$scope = { changed, ctx };
    			tab1.$set(tab1_changes);

    			var tab2_changes = {};
    			if (changed.$$scope) tab2_changes.$$scope = { changed, ctx };
    			tab2.$set(tab2_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(tab0.$$.fragment, local);

    			transition_in(tab1.$$.fragment, local);

    			transition_in(tab2.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(tab0.$$.fragment, local);
    			transition_out(tab1.$$.fragment, local);
    			transition_out(tab2.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(tab0, detaching);

    			if (detaching) {
    				detach(t0);
    			}

    			destroy_component(tab1, detaching);

    			if (detaching) {
    				detach(t1);
    			}

    			destroy_component(tab2, detaching);
    		}
    	};
    }

    // (109:3) <TabBar>
    function create_default_slot_25(ctx) {
    	var current;

    	var tabscroller = new TabScroller({
    		props: {
    		$$slots: { default: [create_default_slot_26] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			tabscroller.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(tabscroller, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var tabscroller_changes = {};
    			if (changed.$$scope) tabscroller_changes.$$scope = { changed, ctx };
    			tabscroller.$set(tabscroller_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(tabscroller.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(tabscroller.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(tabscroller, detaching);
    		}
    	};
    }

    // (108:2) <LayoutGridCell span="6">
    function create_default_slot_24(ctx) {
    	var current;

    	var tabbar = new TabBar({
    		props: {
    		$$slots: { default: [create_default_slot_25] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			tabbar.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(tabbar, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var tabbar_changes = {};
    			if (changed.$$scope) tabbar_changes.$$scope = { changed, ctx };
    			tabbar.$set(tabbar_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(tabbar.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(tabbar.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(tabbar, detaching);
    		}
    	};
    }

    // (107:1) <LayoutGridInner>
    function create_default_slot_23(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		span: "6",
    		$$slots: { default: [create_default_slot_24] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (125:1) <Title>
    function create_default_slot_22(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Drawers");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (128:2) <LayoutGridCell span="12">
    function create_default_slot_21(ctx) {
    	var div2, div0, a, h3, t_1, div1, iframe;

    	return {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			a = element("a");
    			h3 = element("h3");
    			h3.textContent = "Permanent";
    			t_1 = space();
    			div1 = element("div");
    			iframe = element("iframe");
    			attr(h3, "class", "mdc-typography--subtitle1");
    			add_location(h3, file$n, 130, 43, 3986);
    			attr(a, "href", "drawer.html");
    			attr(a, "target", "_blank");
    			add_location(a, file$n, 130, 5, 3948);
    			add_location(div0, file$n, 129, 4, 3936);
    			attr(iframe, "class", "drawer-iframe svelte-1fqch5e");
    			attr(iframe, "title", "Permanent");
    			attr(iframe, "src", "drawer.html");
    			add_location(iframe, file$n, 133, 5, 4072);
    			add_location(div1, file$n, 132, 4, 4060);
    			attr(div2, "class", "drawer-demo svelte-1fqch5e");
    			add_location(div2, file$n, 128, 3, 3905);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div0, a);
    			append(a, h3);
    			append(div2, t_1);
    			append(div2, div1);
    			append(div1, iframe);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div2);
    			}
    		}
    	};
    }

    // (127:1) <LayoutGridInner>
    function create_default_slot_20(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		span: "12",
    		$$slots: { default: [create_default_slot_21] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (141:2) <LayoutGridCell span="12">
    function create_default_slot_19(ctx) {
    	var div2, div0, a, h3, t_1, div1, iframe;

    	return {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			a = element("a");
    			h3 = element("h3");
    			h3.textContent = "Dismissible";
    			t_1 = space();
    			div1 = element("div");
    			iframe = element("iframe");
    			attr(h3, "class", "mdc-typography--subtitle1");
    			add_location(h3, file$n, 143, 58, 4366);
    			attr(a, "href", "drawer.html?dismissible=1");
    			attr(a, "target", "_blank");
    			add_location(a, file$n, 143, 6, 4314);
    			add_location(div0, file$n, 142, 5, 4301);
    			attr(iframe, "class", "drawer-iframe svelte-1fqch5e");
    			attr(iframe, "title", "Permanent");
    			attr(iframe, "src", "drawer.html?dismissible=1");
    			add_location(iframe, file$n, 146, 6, 4457);
    			add_location(div1, file$n, 145, 5, 4444);
    			attr(div2, "class", "drawer-demo svelte-1fqch5e");
    			add_location(div2, file$n, 141, 3, 4269);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div0, a);
    			append(a, h3);
    			append(div2, t_1);
    			append(div2, div1);
    			append(div1, iframe);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div2);
    			}
    		}
    	};
    }

    // (140:1) <LayoutGridInner>
    function create_default_slot_18(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		span: "12",
    		$$slots: { default: [create_default_slot_19] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (154:3) <LayoutGridCell span="12">
    function create_default_slot_17(ctx) {
    	var div2, div0, a, h3, t_1, div1, iframe;

    	return {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			a = element("a");
    			h3 = element("h3");
    			h3.textContent = "Modal";
    			t_1 = space();
    			div1 = element("div");
    			iframe = element("iframe");
    			attr(h3, "class", "mdc-typography--subtitle1");
    			add_location(h3, file$n, 156, 53, 4766);
    			attr(a, "href", "drawer.html?modal=1");
    			attr(a, "target", "_blank");
    			add_location(a, file$n, 156, 7, 4720);
    			add_location(div0, file$n, 155, 6, 4706);
    			attr(iframe, "class", "drawer-iframe svelte-1fqch5e");
    			attr(iframe, "title", "Permanent");
    			attr(iframe, "src", "drawer.html?modal=1");
    			add_location(iframe, file$n, 159, 7, 4854);
    			add_location(div1, file$n, 158, 6, 4840);
    			attr(div2, "class", "drawer-demo svelte-1fqch5e");
    			add_location(div2, file$n, 154, 4, 4673);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div0, a);
    			append(a, h3);
    			append(div2, t_1);
    			append(div2, div1);
    			append(div1, iframe);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div2);
    			}
    		}
    	};
    }

    // (153:1) <LayoutGridInner>
    function create_default_slot_16(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		span: "12",
    		$$slots: { default: [create_default_slot_17] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (166:1) <Title>
    function create_default_slot_15(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Dialogs");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (169:3) <Button unelevated background="secondary-dark" on:click="{showDialog}" >
    function create_default_slot_14(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Alert");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (171:4) <span slot="header">
    function create_header_slot(ctx) {
    	var span;

    	return {
    		c: function create() {
    			span = element("span");
    			span.textContent = "My first dialog";
    			attr(span, "slot", "header");
    			add_location(span, file$n, 170, 4, 5216);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (172:4) <p slot="body">
    function create_body_slot(ctx) {
    	var p;

    	return {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
    			attr(p, "slot", "body");
    			add_location(p, file$n, 171, 4, 5264);
    		},

    		m: function mount(target, anchor) {
    			insert(target, p, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(p);
    			}
    		}
    	};
    }

    // (175:4) <span slot="footer">
    function create_footer_slot(ctx) {
    	var span, t, current;

    	var dialogbutton0 = new DialogButton({
    		props: { label: "Cancel", action: "close" },
    		$$inline: true
    	});

    	var dialogbutton1 = new DialogButton({
    		props: { label: "OK", action: "accept" },
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			span = element("span");
    			dialogbutton0.$$.fragment.c();
    			t = space();
    			dialogbutton1.$$.fragment.c();
    			attr(span, "slot", "footer");
    			add_location(span, file$n, 174, 4, 5425);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			mount_component(dialogbutton0, span, null);
    			append(span, t);
    			mount_component(dialogbutton1, span, null);
    			current = true;
    		},

    		p: noop,

    		i: function intro(local) {
    			if (current) return;
    			transition_in(dialogbutton0.$$.fragment, local);

    			transition_in(dialogbutton1.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(dialogbutton0.$$.fragment, local);
    			transition_out(dialogbutton1.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			destroy_component(dialogbutton0, );

    			destroy_component(dialogbutton1, );
    		}
    	};
    }

    // (170:3) <Dialog bind:this="{dialog}">
    function create_default_slot_13(ctx) {
    	var t0, t1;

    	return {
    		c: function create() {
    			t0 = space();
    			t1 = space();
    		},

    		m: function mount(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    		},

    		p: noop,
    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t0);
    				detach(t1);
    			}
    		}
    	};
    }

    // (168:2) <LayoutGridCell span="6">
    function create_default_slot_12(ctx) {
    	var t, current;

    	var button = new Button({
    		props: {
    		unelevated: true,
    		background: "secondary-dark",
    		$$slots: { default: [create_default_slot_14] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button.$on("click", ctx.showDialog);

    	let dialog_1_props = {
    		$$slots: {
    		default: [create_default_slot_13],
    		footer: [create_footer_slot],
    		body: [create_body_slot],
    		header: [create_header_slot]
    	},
    		$$scope: { ctx }
    	};
    	var dialog_1 = new Dialog({ props: dialog_1_props, $$inline: true });

    	add_binding_callback(() => ctx.dialog_1_binding(dialog_1));

    	return {
    		c: function create() {
    			button.$$.fragment.c();
    			t = space();
    			dialog_1.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(button, target, anchor);
    			insert(target, t, anchor);
    			mount_component(dialog_1, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var button_changes = {};
    			if (changed.$$scope) button_changes.$$scope = { changed, ctx };
    			button.$set(button_changes);

    			var dialog_1_changes = {};
    			if (changed.$$scope) dialog_1_changes.$$scope = { changed, ctx };
    			dialog_1.$set(dialog_1_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);

    			transition_in(dialog_1.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			transition_out(dialog_1.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(button, detaching);

    			if (detaching) {
    				detach(t);
    			}

    			ctx.dialog_1_binding(null);

    			destroy_component(dialog_1, detaching);
    		}
    	};
    }

    // (167:1) <LayoutGridInner>
    function create_default_slot_11(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		span: "6",
    		$$slots: { default: [create_default_slot_12] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope || changed.dialog) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (185:3) <Subheading level="1">
    function create_default_slot_10(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Icon");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (184:2) <LayoutGridCell span="2">
    function create_default_slot_9(ctx) {
    	var t, current;

    	var subheading = new Subheading({
    		props: {
    		level: "1",
    		$$slots: { default: [create_default_slot_10] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var icon = new Icon({ props: { icon: "cloud" }, $$inline: true });

    	return {
    		c: function create() {
    			subheading.$$.fragment.c();
    			t = space();
    			icon.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(subheading, target, anchor);
    			insert(target, t, anchor);
    			mount_component(icon, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var subheading_changes = {};
    			if (changed.$$scope) subheading_changes.$$scope = { changed, ctx };
    			subheading.$set(subheading_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(subheading.$$.fragment, local);

    			transition_in(icon.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(subheading.$$.fragment, local);
    			transition_out(icon.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(subheading, detaching);

    			if (detaching) {
    				detach(t);
    			}

    			destroy_component(icon, detaching);
    		}
    	};
    }

    // (189:3) <Subheading level="1">
    function create_default_slot_8(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("IconButton");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (188:2) <LayoutGridCell span="2">
    function create_default_slot_7(ctx) {
    	var t, current;

    	var subheading = new Subheading({
    		props: {
    		level: "1",
    		$$slots: { default: [create_default_slot_8] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var icontoggle = new IconToggle({
    		props: { icon: "favorite", accent: true },
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			subheading.$$.fragment.c();
    			t = space();
    			icontoggle.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(subheading, target, anchor);
    			insert(target, t, anchor);
    			mount_component(icontoggle, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var subheading_changes = {};
    			if (changed.$$scope) subheading_changes.$$scope = { changed, ctx };
    			subheading.$set(subheading_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(subheading.$$.fragment, local);

    			transition_in(icontoggle.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(subheading.$$.fragment, local);
    			transition_out(icontoggle.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(subheading, detaching);

    			if (detaching) {
    				detach(t);
    			}

    			destroy_component(icontoggle, detaching);
    		}
    	};
    }

    // (193:3) <Subheading level="1">
    function create_default_slot_6(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("IconToggle");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (192:2) <LayoutGridCell span="2">
    function create_default_slot_5(ctx) {
    	var t, current;

    	var subheading = new Subheading({
    		props: {
    		level: "1",
    		$$slots: { default: [create_default_slot_6] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var icontoggle = new IconToggle({
    		props: {
    		value: ctx.iconToggle,
    		iconOn: "favorite",
    		iconOff: "favorite_border",
    		accent: true
    	},
    		$$inline: true
    	});
    	icontoggle.$on("input", ctx.input_handler);

    	return {
    		c: function create() {
    			subheading.$$.fragment.c();
    			t = space();
    			icontoggle.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(subheading, target, anchor);
    			insert(target, t, anchor);
    			mount_component(icontoggle, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var subheading_changes = {};
    			if (changed.$$scope) subheading_changes.$$scope = { changed, ctx };
    			subheading.$set(subheading_changes);

    			var icontoggle_changes = {};
    			if (changed.iconToggle) icontoggle_changes.value = ctx.iconToggle;
    			icontoggle.$set(icontoggle_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(subheading.$$.fragment, local);

    			transition_in(icontoggle.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(subheading.$$.fragment, local);
    			transition_out(icontoggle.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(subheading, detaching);

    			if (detaching) {
    				detach(t);
    			}

    			destroy_component(icontoggle, detaching);
    		}
    	};
    }

    // (183:1) <LayoutGridInner>
    function create_default_slot_4(ctx) {
    	var t0, t1, current;

    	var layoutgridcell0 = new LayoutGridCell({
    		props: {
    		span: "2",
    		$$slots: { default: [create_default_slot_9] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridcell1 = new LayoutGridCell({
    		props: {
    		span: "2",
    		$$slots: { default: [create_default_slot_7] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridcell2 = new LayoutGridCell({
    		props: {
    		span: "2",
    		$$slots: { default: [create_default_slot_5] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell0.$$.fragment.c();
    			t0 = space();
    			layoutgridcell1.$$.fragment.c();
    			t1 = space();
    			layoutgridcell2.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(layoutgridcell1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(layoutgridcell2, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell0_changes = {};
    			if (changed.$$scope) layoutgridcell0_changes.$$scope = { changed, ctx };
    			layoutgridcell0.$set(layoutgridcell0_changes);

    			var layoutgridcell1_changes = {};
    			if (changed.$$scope) layoutgridcell1_changes.$$scope = { changed, ctx };
    			layoutgridcell1.$set(layoutgridcell1_changes);

    			var layoutgridcell2_changes = {};
    			if (changed.$$scope || changed.iconToggle) layoutgridcell2_changes.$$scope = { changed, ctx };
    			layoutgridcell2.$set(layoutgridcell2_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell0.$$.fragment, local);

    			transition_in(layoutgridcell1.$$.fragment, local);

    			transition_in(layoutgridcell2.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell0.$$.fragment, local);
    			transition_out(layoutgridcell1.$$.fragment, local);
    			transition_out(layoutgridcell2.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell0, detaching);

    			if (detaching) {
    				detach(t0);
    			}

    			destroy_component(layoutgridcell1, detaching);

    			if (detaching) {
    				detach(t1);
    			}

    			destroy_component(layoutgridcell2, detaching);
    		}
    	};
    }

    // (198:1) <Title>
    function create_default_slot_3(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Linear Progress");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (201:2) <LayoutGridCell>
    function create_default_slot_2(ctx) {
    	var current;

    	let linearprogress_props = {
    		progressbar: ctx.progressbar,
    		open: true,
    		progress: "0.5",
    		buffer: "0.5",
    		indeterminate: true
    	};
    	var linearprogress = new LinearProgress({
    		props: linearprogress_props,
    		$$inline: true
    	});

    	add_binding_callback(() => ctx.linearprogress_binding(linearprogress));

    	return {
    		c: function create() {
    			linearprogress.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(linearprogress, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var linearprogress_changes = {};
    			if (changed.progressbar) linearprogress_changes.progressbar = ctx.progressbar;
    			linearprogress.$set(linearprogress_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(linearprogress.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(linearprogress.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			ctx.linearprogress_binding(null);

    			destroy_component(linearprogress, detaching);
    		}
    	};
    }

    // (200:1) <LayoutGridInner>
    function create_default_slot_1(ctx) {
    	var current;

    	var layoutgridcell = new LayoutGridCell({
    		props: {
    		$$slots: { default: [create_default_slot_2] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgridcell.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgridcell, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgridcell_changes = {};
    			if (changed.$$scope || changed.progressbar) layoutgridcell_changes.$$scope = { changed, ctx };
    			layoutgridcell.$set(layoutgridcell_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgridcell.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgridcell.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgridcell, detaching);
    		}
    	};
    }

    // (37:0) <LayoutGrid fixedColumnWidth>
    function create_default_slot$2(ctx) {
    	var t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16, t17, t18, t19, t20, t21, t22, t23, t24, t25, t26, t27, t28, current;

    	var display = new Display({
    		props: {
    		level: "2",
    		adjustMargin: true,
    		$$slots: { default: [create_default_slot_62] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var headline = new Headline({
    		props: {
    		adjustMargin: true,
    		$$slots: { default: [create_default_slot_61] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var title0 = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_60] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var button0 = new Button({
    		props: {
    		icon: "build",
    		raised: true,
    		href: "#",
    		$$slots: { default: [create_default_slot_59] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var button1 = new Button({
    		props: {
    		icon: "grade",
    		unelevated: true,
    		background: "secondary-dark",
    		$$slots: { default: [create_default_slot_58] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var button2 = new Button({
    		props: {
    		icon: "cake",
    		color: "secondary-dark",
    		$$slots: { default: [create_default_slot_57] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var button3 = new Button({
    		props: {
    		icon: "ac_unit",
    		unelevated: true,
    		dense: true,
    		disabled: true,
    		$$slots: { default: [create_default_slot_56] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var button4 = new Button({
    		props: {
    		icon: "build",
    		raised: true,
    		compact: true,
    		href: "#",
    		$$slots: { default: [create_default_slot_55] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var button5 = new Button({
    		props: {
    		icon: "grade",
    		stroked: true,
    		type: "submit",
    		$$slots: { default: [create_default_slot_54] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var title1 = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_53] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner0 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_51] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var subheading = new Subheading({
    		props: {
    		level: "2",
    		$$slots: { default: [create_default_slot_50] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var body = new Body({
    		props: {
    		$$slots: { default: [create_default_slot_49] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var title2 = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_48] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner1 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_41] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var title3 = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_40] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner2 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_38] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var title4 = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_37] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner3 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_31] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var title5 = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_30] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner4 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_23] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var title6 = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_22] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner5 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_20] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner6 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_18] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner7 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_16] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var title7 = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_15] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner8 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_11] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner9 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_4] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var title8 = new Title({
    		props: {
    		$$slots: { default: [create_default_slot_3] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var layoutgridinner10 = new LayoutGridInner({
    		props: {
    		$$slots: { default: [create_default_slot_1] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			display.$$.fragment.c();
    			t0 = space();
    			headline.$$.fragment.c();
    			t1 = space();
    			title0.$$.fragment.c();
    			t2 = space();
    			button0.$$.fragment.c();
    			t3 = space();
    			button1.$$.fragment.c();
    			t4 = space();
    			button2.$$.fragment.c();
    			t5 = space();
    			button3.$$.fragment.c();
    			t6 = space();
    			button4.$$.fragment.c();
    			t7 = space();
    			button5.$$.fragment.c();
    			t8 = space();
    			title1.$$.fragment.c();
    			t9 = space();
    			layoutgridinner0.$$.fragment.c();
    			t10 = space();
    			subheading.$$.fragment.c();
    			t11 = space();
    			body.$$.fragment.c();
    			t12 = space();
    			title2.$$.fragment.c();
    			t13 = space();
    			layoutgridinner1.$$.fragment.c();
    			t14 = space();
    			title3.$$.fragment.c();
    			t15 = space();
    			layoutgridinner2.$$.fragment.c();
    			t16 = space();
    			title4.$$.fragment.c();
    			t17 = space();
    			layoutgridinner3.$$.fragment.c();
    			t18 = space();
    			title5.$$.fragment.c();
    			t19 = space();
    			layoutgridinner4.$$.fragment.c();
    			t20 = space();
    			title6.$$.fragment.c();
    			t21 = space();
    			layoutgridinner5.$$.fragment.c();
    			t22 = space();
    			layoutgridinner6.$$.fragment.c();
    			t23 = space();
    			layoutgridinner7.$$.fragment.c();
    			t24 = space();
    			title7.$$.fragment.c();
    			t25 = space();
    			layoutgridinner8.$$.fragment.c();
    			t26 = space();
    			layoutgridinner9.$$.fragment.c();
    			t27 = space();
    			title8.$$.fragment.c();
    			t28 = space();
    			layoutgridinner10.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(display, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(headline, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(title0, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(button0, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(button1, target, anchor);
    			insert(target, t4, anchor);
    			mount_component(button2, target, anchor);
    			insert(target, t5, anchor);
    			mount_component(button3, target, anchor);
    			insert(target, t6, anchor);
    			mount_component(button4, target, anchor);
    			insert(target, t7, anchor);
    			mount_component(button5, target, anchor);
    			insert(target, t8, anchor);
    			mount_component(title1, target, anchor);
    			insert(target, t9, anchor);
    			mount_component(layoutgridinner0, target, anchor);
    			insert(target, t10, anchor);
    			mount_component(subheading, target, anchor);
    			insert(target, t11, anchor);
    			mount_component(body, target, anchor);
    			insert(target, t12, anchor);
    			mount_component(title2, target, anchor);
    			insert(target, t13, anchor);
    			mount_component(layoutgridinner1, target, anchor);
    			insert(target, t14, anchor);
    			mount_component(title3, target, anchor);
    			insert(target, t15, anchor);
    			mount_component(layoutgridinner2, target, anchor);
    			insert(target, t16, anchor);
    			mount_component(title4, target, anchor);
    			insert(target, t17, anchor);
    			mount_component(layoutgridinner3, target, anchor);
    			insert(target, t18, anchor);
    			mount_component(title5, target, anchor);
    			insert(target, t19, anchor);
    			mount_component(layoutgridinner4, target, anchor);
    			insert(target, t20, anchor);
    			mount_component(title6, target, anchor);
    			insert(target, t21, anchor);
    			mount_component(layoutgridinner5, target, anchor);
    			insert(target, t22, anchor);
    			mount_component(layoutgridinner6, target, anchor);
    			insert(target, t23, anchor);
    			mount_component(layoutgridinner7, target, anchor);
    			insert(target, t24, anchor);
    			mount_component(title7, target, anchor);
    			insert(target, t25, anchor);
    			mount_component(layoutgridinner8, target, anchor);
    			insert(target, t26, anchor);
    			mount_component(layoutgridinner9, target, anchor);
    			insert(target, t27, anchor);
    			mount_component(title8, target, anchor);
    			insert(target, t28, anchor);
    			mount_component(layoutgridinner10, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var display_changes = {};
    			if (changed.$$scope) display_changes.$$scope = { changed, ctx };
    			display.$set(display_changes);

    			var headline_changes = {};
    			if (changed.$$scope || changed.name) headline_changes.$$scope = { changed, ctx };
    			headline.$set(headline_changes);

    			var title0_changes = {};
    			if (changed.$$scope) title0_changes.$$scope = { changed, ctx };
    			title0.$set(title0_changes);

    			var button0_changes = {};
    			if (changed.$$scope) button0_changes.$$scope = { changed, ctx };
    			button0.$set(button0_changes);

    			var button1_changes = {};
    			if (changed.$$scope) button1_changes.$$scope = { changed, ctx };
    			button1.$set(button1_changes);

    			var button2_changes = {};
    			if (changed.$$scope) button2_changes.$$scope = { changed, ctx };
    			button2.$set(button2_changes);

    			var button3_changes = {};
    			if (changed.$$scope) button3_changes.$$scope = { changed, ctx };
    			button3.$set(button3_changes);

    			var button4_changes = {};
    			if (changed.$$scope) button4_changes.$$scope = { changed, ctx };
    			button4.$set(button4_changes);

    			var button5_changes = {};
    			if (changed.$$scope) button5_changes.$$scope = { changed, ctx };
    			button5.$set(button5_changes);

    			var title1_changes = {};
    			if (changed.$$scope) title1_changes.$$scope = { changed, ctx };
    			title1.$set(title1_changes);

    			var layoutgridinner0_changes = {};
    			if (changed.$$scope) layoutgridinner0_changes.$$scope = { changed, ctx };
    			layoutgridinner0.$set(layoutgridinner0_changes);

    			var subheading_changes = {};
    			if (changed.$$scope) subheading_changes.$$scope = { changed, ctx };
    			subheading.$set(subheading_changes);

    			var body_changes = {};
    			if (changed.$$scope) body_changes.$$scope = { changed, ctx };
    			body.$set(body_changes);

    			var title2_changes = {};
    			if (changed.$$scope) title2_changes.$$scope = { changed, ctx };
    			title2.$set(title2_changes);

    			var layoutgridinner1_changes = {};
    			if (changed.$$scope) layoutgridinner1_changes.$$scope = { changed, ctx };
    			layoutgridinner1.$set(layoutgridinner1_changes);

    			var title3_changes = {};
    			if (changed.$$scope) title3_changes.$$scope = { changed, ctx };
    			title3.$set(title3_changes);

    			var layoutgridinner2_changes = {};
    			if (changed.$$scope || changed.checkboxValue) layoutgridinner2_changes.$$scope = { changed, ctx };
    			layoutgridinner2.$set(layoutgridinner2_changes);

    			var title4_changes = {};
    			if (changed.$$scope) title4_changes.$$scope = { changed, ctx };
    			title4.$set(title4_changes);

    			var layoutgridinner3_changes = {};
    			if (changed.$$scope || changed.menu) layoutgridinner3_changes.$$scope = { changed, ctx };
    			layoutgridinner3.$set(layoutgridinner3_changes);

    			var title5_changes = {};
    			if (changed.$$scope) title5_changes.$$scope = { changed, ctx };
    			title5.$set(title5_changes);

    			var layoutgridinner4_changes = {};
    			if (changed.$$scope) layoutgridinner4_changes.$$scope = { changed, ctx };
    			layoutgridinner4.$set(layoutgridinner4_changes);

    			var title6_changes = {};
    			if (changed.$$scope) title6_changes.$$scope = { changed, ctx };
    			title6.$set(title6_changes);

    			var layoutgridinner5_changes = {};
    			if (changed.$$scope) layoutgridinner5_changes.$$scope = { changed, ctx };
    			layoutgridinner5.$set(layoutgridinner5_changes);

    			var layoutgridinner6_changes = {};
    			if (changed.$$scope) layoutgridinner6_changes.$$scope = { changed, ctx };
    			layoutgridinner6.$set(layoutgridinner6_changes);

    			var layoutgridinner7_changes = {};
    			if (changed.$$scope) layoutgridinner7_changes.$$scope = { changed, ctx };
    			layoutgridinner7.$set(layoutgridinner7_changes);

    			var title7_changes = {};
    			if (changed.$$scope) title7_changes.$$scope = { changed, ctx };
    			title7.$set(title7_changes);

    			var layoutgridinner8_changes = {};
    			if (changed.$$scope || changed.dialog) layoutgridinner8_changes.$$scope = { changed, ctx };
    			layoutgridinner8.$set(layoutgridinner8_changes);

    			var layoutgridinner9_changes = {};
    			if (changed.$$scope || changed.iconToggle) layoutgridinner9_changes.$$scope = { changed, ctx };
    			layoutgridinner9.$set(layoutgridinner9_changes);

    			var title8_changes = {};
    			if (changed.$$scope) title8_changes.$$scope = { changed, ctx };
    			title8.$set(title8_changes);

    			var layoutgridinner10_changes = {};
    			if (changed.$$scope || changed.progressbar) layoutgridinner10_changes.$$scope = { changed, ctx };
    			layoutgridinner10.$set(layoutgridinner10_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(display.$$.fragment, local);

    			transition_in(headline.$$.fragment, local);

    			transition_in(title0.$$.fragment, local);

    			transition_in(button0.$$.fragment, local);

    			transition_in(button1.$$.fragment, local);

    			transition_in(button2.$$.fragment, local);

    			transition_in(button3.$$.fragment, local);

    			transition_in(button4.$$.fragment, local);

    			transition_in(button5.$$.fragment, local);

    			transition_in(title1.$$.fragment, local);

    			transition_in(layoutgridinner0.$$.fragment, local);

    			transition_in(subheading.$$.fragment, local);

    			transition_in(body.$$.fragment, local);

    			transition_in(title2.$$.fragment, local);

    			transition_in(layoutgridinner1.$$.fragment, local);

    			transition_in(title3.$$.fragment, local);

    			transition_in(layoutgridinner2.$$.fragment, local);

    			transition_in(title4.$$.fragment, local);

    			transition_in(layoutgridinner3.$$.fragment, local);

    			transition_in(title5.$$.fragment, local);

    			transition_in(layoutgridinner4.$$.fragment, local);

    			transition_in(title6.$$.fragment, local);

    			transition_in(layoutgridinner5.$$.fragment, local);

    			transition_in(layoutgridinner6.$$.fragment, local);

    			transition_in(layoutgridinner7.$$.fragment, local);

    			transition_in(title7.$$.fragment, local);

    			transition_in(layoutgridinner8.$$.fragment, local);

    			transition_in(layoutgridinner9.$$.fragment, local);

    			transition_in(title8.$$.fragment, local);

    			transition_in(layoutgridinner10.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(display.$$.fragment, local);
    			transition_out(headline.$$.fragment, local);
    			transition_out(title0.$$.fragment, local);
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			transition_out(button2.$$.fragment, local);
    			transition_out(button3.$$.fragment, local);
    			transition_out(button4.$$.fragment, local);
    			transition_out(button5.$$.fragment, local);
    			transition_out(title1.$$.fragment, local);
    			transition_out(layoutgridinner0.$$.fragment, local);
    			transition_out(subheading.$$.fragment, local);
    			transition_out(body.$$.fragment, local);
    			transition_out(title2.$$.fragment, local);
    			transition_out(layoutgridinner1.$$.fragment, local);
    			transition_out(title3.$$.fragment, local);
    			transition_out(layoutgridinner2.$$.fragment, local);
    			transition_out(title4.$$.fragment, local);
    			transition_out(layoutgridinner3.$$.fragment, local);
    			transition_out(title5.$$.fragment, local);
    			transition_out(layoutgridinner4.$$.fragment, local);
    			transition_out(title6.$$.fragment, local);
    			transition_out(layoutgridinner5.$$.fragment, local);
    			transition_out(layoutgridinner6.$$.fragment, local);
    			transition_out(layoutgridinner7.$$.fragment, local);
    			transition_out(title7.$$.fragment, local);
    			transition_out(layoutgridinner8.$$.fragment, local);
    			transition_out(layoutgridinner9.$$.fragment, local);
    			transition_out(title8.$$.fragment, local);
    			transition_out(layoutgridinner10.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(display, detaching);

    			if (detaching) {
    				detach(t0);
    			}

    			destroy_component(headline, detaching);

    			if (detaching) {
    				detach(t1);
    			}

    			destroy_component(title0, detaching);

    			if (detaching) {
    				detach(t2);
    			}

    			destroy_component(button0, detaching);

    			if (detaching) {
    				detach(t3);
    			}

    			destroy_component(button1, detaching);

    			if (detaching) {
    				detach(t4);
    			}

    			destroy_component(button2, detaching);

    			if (detaching) {
    				detach(t5);
    			}

    			destroy_component(button3, detaching);

    			if (detaching) {
    				detach(t6);
    			}

    			destroy_component(button4, detaching);

    			if (detaching) {
    				detach(t7);
    			}

    			destroy_component(button5, detaching);

    			if (detaching) {
    				detach(t8);
    			}

    			destroy_component(title1, detaching);

    			if (detaching) {
    				detach(t9);
    			}

    			destroy_component(layoutgridinner0, detaching);

    			if (detaching) {
    				detach(t10);
    			}

    			destroy_component(subheading, detaching);

    			if (detaching) {
    				detach(t11);
    			}

    			destroy_component(body, detaching);

    			if (detaching) {
    				detach(t12);
    			}

    			destroy_component(title2, detaching);

    			if (detaching) {
    				detach(t13);
    			}

    			destroy_component(layoutgridinner1, detaching);

    			if (detaching) {
    				detach(t14);
    			}

    			destroy_component(title3, detaching);

    			if (detaching) {
    				detach(t15);
    			}

    			destroy_component(layoutgridinner2, detaching);

    			if (detaching) {
    				detach(t16);
    			}

    			destroy_component(title4, detaching);

    			if (detaching) {
    				detach(t17);
    			}

    			destroy_component(layoutgridinner3, detaching);

    			if (detaching) {
    				detach(t18);
    			}

    			destroy_component(title5, detaching);

    			if (detaching) {
    				detach(t19);
    			}

    			destroy_component(layoutgridinner4, detaching);

    			if (detaching) {
    				detach(t20);
    			}

    			destroy_component(title6, detaching);

    			if (detaching) {
    				detach(t21);
    			}

    			destroy_component(layoutgridinner5, detaching);

    			if (detaching) {
    				detach(t22);
    			}

    			destroy_component(layoutgridinner6, detaching);

    			if (detaching) {
    				detach(t23);
    			}

    			destroy_component(layoutgridinner7, detaching);

    			if (detaching) {
    				detach(t24);
    			}

    			destroy_component(title7, detaching);

    			if (detaching) {
    				detach(t25);
    			}

    			destroy_component(layoutgridinner8, detaching);

    			if (detaching) {
    				detach(t26);
    			}

    			destroy_component(layoutgridinner9, detaching);

    			if (detaching) {
    				detach(t27);
    			}

    			destroy_component(title8, detaching);

    			if (detaching) {
    				detach(t28);
    			}

    			destroy_component(layoutgridinner10, detaching);
    		}
    	};
    }

    function create_fragment$o(ctx) {
    	var current;

    	var layoutgrid = new LayoutGrid({
    		props: {
    		fixedColumnWidth: true,
    		$$slots: { default: [create_default_slot$2] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			layoutgrid.$$.fragment.c();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			mount_component(layoutgrid, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var layoutgrid_changes = {};
    			if (changed.$$scope || changed.progressbar || changed.iconToggle || changed.dialog || changed.menu || changed.checkboxValue || changed.name) layoutgrid_changes.$$scope = { changed, ctx };
    			layoutgrid.$set(layoutgrid_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(layoutgrid.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(layoutgrid.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(layoutgrid, detaching);
    		}
    	};
    }

    function iconEvent(value) {
        console.log('IconToggle clicked', value);
      }

    function instance$o($$self, $$props, $$invalidate) {
    	let { customStyles = {
        '--mdc-theme-primary': '#CDDC39'
      }, name = 'Svelte Material Components', checkboxValue = true, iconToggle = false, progressbar = null, dialog = null, menu = null } = $$props;

    	function showDialog() {
    		dialog.show();
    	}

    	function showMenu() {
    		menu.show(true);
    	}

    	const writable_props = ['customStyles', 'name', 'checkboxValue', 'iconToggle', 'progressbar', 'dialog', 'menu'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1$3.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function menu_1_binding($$component) {
    		menu = $$component;
    		$$invalidate('menu', menu);
    	}

    	function dialog_1_binding($$component) {
    		dialog = $$component;
    		$$invalidate('dialog', dialog);
    	}

    	function input_handler(event) {
    		return iconEvent(event.value);
    	}

    	function linearprogress_binding($$component) {
    		progressbar = $$component;
    		$$invalidate('progressbar', progressbar);
    	}

    	$$self.$set = $$props => {
    		if ('customStyles' in $$props) $$invalidate('customStyles', customStyles = $$props.customStyles);
    		if ('name' in $$props) $$invalidate('name', name = $$props.name);
    		if ('checkboxValue' in $$props) $$invalidate('checkboxValue', checkboxValue = $$props.checkboxValue);
    		if ('iconToggle' in $$props) $$invalidate('iconToggle', iconToggle = $$props.iconToggle);
    		if ('progressbar' in $$props) $$invalidate('progressbar', progressbar = $$props.progressbar);
    		if ('dialog' in $$props) $$invalidate('dialog', dialog = $$props.dialog);
    		if ('menu' in $$props) $$invalidate('menu', menu = $$props.menu);
    	};

    	return {
    		customStyles,
    		name,
    		checkboxValue,
    		iconToggle,
    		progressbar,
    		dialog,
    		menu,
    		showDialog,
    		showMenu,
    		menu_1_binding,
    		dialog_1_binding,
    		input_handler,
    		linearprogress_binding
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$o, create_fragment$o, safe_not_equal, ["customStyles", "name", "checkboxValue", "iconToggle", "progressbar", "dialog", "menu", "iconEvent"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.iconEvent === undefined && !('iconEvent' in props)) {
    			console_1$3.warn("<App> was created without expected prop 'iconEvent'");
    		}
    	}

    	get customStyles() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set customStyles(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get name() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get checkboxValue() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set checkboxValue(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iconToggle() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iconToggle(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get progressbar() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set progressbar(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dialog() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dialog(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get menu() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set menu(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iconEvent() {
    		return iconEvent;
    	}

    	set iconEvent(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const app = new App({
        target: document.body,
        props: {
            name: 'Svelte Material Design Components'
        }
    });
    window.app = app;

    return app;

}());
//# sourceMappingURL=bundle.js.map

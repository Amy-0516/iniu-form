/**
 * INIU Form Language Sync — v3（语言切换器 → Dropdown 字段）
 * -------------------------------------------------------------------------
 * 用途：
 *   在 123FormBuilder 表单中，当用户切换页面顶部的「语言切换器」时，
 *   把选中的语言 code 原样写入目标 Dropdown 字段（ID 121884187），
 *   使表单提交时能携带用户所选语言信息（供 Zendesk 按语言自动回复）。
 *
 * v3 关键结论（从 123FormBuilder 引擎源码 + 官方文档确认）：
 *   1. 语言切换器模板为 <select data-role="language-dropdown">，但渲染后经
 *      upgradeDropdown() 升级为自定义 dropdown 组件，data-role 被改为
 *      "i123-input"，外层容器为 div[data-role="control"][data-type="language-selector"]，
 *      组件内部仍保留一个原生 <select>（nativeDropDown），其 value 即语言 code。
 *   2. 写入字段采用【官方 API 优先 + DOM 直连兜底】双保险：
 *      - 首选 loader.getDOMAbstractionLayer().setControlValueById(id, value)
 *        （123FormBuilder 官方推荐的字段赋值入口）
 *      - 兜底：直接操作目标字段容器内的原生 <select>，设 .value + trigger change
 *   3. 事件委托监听语言切换器的 change，切换后分多次延迟写入，
 *      以等待表单引擎完成语言重渲染。
 *
 * 目标字段运行时 DOM 结构（已确认）：
 *   <div data-role="control" data-id="121884187" ...>
 *       <div data-role="i123-input" data-type="dropdown">
 *           <select>...</select>
 *       </div>
 *   </div>
 *
 * 依赖：优先使用全局 loader（123FormBuilder 提供），缺失时退回纯 DOM 操作。
 *
 * 用法：
 *   1. 在表单 Advanced → Form → "Add a JS script to your form" 粘贴脚本 URL。
 *      ⚠️ 必须使用 GitHub Pages 链接（返回 application/javascript MIME）：
 *      https://amy-0516.github.io/iniu-form/iniu-form-language-sync-v3.js
 *      ❌ 不要用 raw.githubusercontent.com（返回 text/plain，浏览器拒绝执行）。
 *   2. 如需改动目标字段 ID，修改下方 CONFIG.TARGET_FIELD_ID。
 *
 * @author  INIU
 * @version 3.2.0
 * -------------------------------------------------------------------------
 */
(function () {
    'use strict';

    var CONFIG = {
        /** 目标 Dropdown 字段 ID（接收语言 code） */
        TARGET_FIELD_ID: '121884187',

        /**
         * 语言切换器候选选择器（按优先级尝试，第一个命中即用）。
         *
         * 真实运行时结构（已从引擎源码确认）：
         *   模板 <select data-role="language-dropdown"> 渲染后，被 upgradeDropdown()
         *   升级为自定义 dropdown 组件，data-role 被改为 "i123-input"，
         *   data-type 变为 "dropdown"，外层容器是：
         *     div[data-role="control"][data-type="language-selector"]
         *   组件内部仍保留一个原生 <select>（nativeDropDown）。
         */
        LANGUAGE_SELECTOR: [
            'div[data-role="control"][data-type="language-selector"] select',
            'div[data-role="control"][data-type="language-selector"] [data-type="dropdown"] select',
            '[data-type="language-selector"] select',
            '[data-role="language-selector"] select',
            'select[data-role="language-dropdown"]',
            'select[data-type="language-selector"]'
        ],

        /** Dropdown 字段支持的语言 code 集合（用于校验 + 兜底） */
        VALID_CODES: {
            en: true, dk: true, de: true, pt: true, es: true,
            fr: true, it: true, nl: true, pl: true, fi: true,
            se: true, sa: true, jp: true
        },

        /** 不支持 code（如 ie）的兜底语言 */
        FALLBACK_LANGUAGE: 'en',

        /** 绑定重试延迟（毫秒），应对选择器/字段动态渲染 */
        BIND_RETRY_DELAYS: [200, 600, 1200, 2500, 4000],

        /** 切换语言后写入字段的延迟（毫秒），等待表单引擎完成翻译重渲染 */
        SYNC_DELAYS: [100, 400, 900],

        /** 是否输出调试日志 */
        DEBUG: true
    };

    /* =============================================================
     * 日志
     * ============================================================= */
    var PREFIX = '[iNIU] Language Sync v3';
    function log() {
        if (!CONFIG.DEBUG) { return; }
        var args = Array.prototype.slice.call(arguments);
        args.unshift(PREFIX);
        try { console.log.apply(console, args); } catch (e) {}
    }
    function warn() {
        if (!CONFIG.DEBUG) { return; }
        var args = Array.prototype.slice.call(arguments);
        args.unshift(PREFIX);
        try { console.warn.apply(console, args); } catch (e) {}
    }

    /* =============================================================
     * 工具函数
     * ============================================================= */
    /** 获取语言切换器 <select> */
    function getLanguageSelect() {
        for (var i = 0; i < CONFIG.LANGUAGE_SELECTOR.length; i++) {
            var el = document.querySelector(CONFIG.LANGUAGE_SELECTOR[i]);
            if (el) { return el; }
        }
        return null;
    }

    /** 获取全局 loader（123FormBuilder 提供） */
    function getLoader() {
        try {
            if (window.loader) { return window.loader; }
            if (window.Engine) { return window.Engine; }
        } catch (e) {}
        return null;
    }

    /**
     * 获取目标 Dropdown 字段的原生 <select>。
     * 先按 data-id 定位字段容器，再取其中的原生 select。
     */
    function getTargetSelect() {
        var container = document.querySelector(
            '[data-role="control"][data-id="' + CONFIG.TARGET_FIELD_ID + '"],' +
            '[data-id="' + CONFIG.TARGET_FIELD_ID + '"]'
        );
        if (container) {
            var native = container.querySelector('select');
            if (native) { return native; }
        }
        return null;
    }

    /** 规范化语言 code（校验 + 兜底） */
    function normalizeCode(rawCode) {
        if (!rawCode) { return null; }
        if (CONFIG.VALID_CODES[rawCode]) { return rawCode; }
        var lower = String(rawCode).toLowerCase();
        if (CONFIG.VALID_CODES[lower]) { return lower; }
        warn('Unsupported language code "' + rawCode + '", fallback to ' + CONFIG.FALLBACK_LANGUAGE);
        return CONFIG.FALLBACK_LANGUAGE;
    }

    /* =============================================================
     * 写入逻辑（核心：官方 API 优先 + DOM 直连兜底）
     * ============================================================= */
    function syncLanguage() {
        var langSelect = getLanguageSelect();
        if (!langSelect) {
            warn('Language selector not found yet.');
            return false;
        }

        var rawCode = langSelect.value;
        if (!rawCode) {
            warn('Language selector has empty value.');
            return false;
        }

        var code = normalizeCode(rawCode);
        if (!code) { return false; }

        // 策略 1：官方 API —— loader.getDOMAbstractionLayer().setControlValueById()
        if (writeViaOfficialAPI(code)) {
            log('Synced (official API): language "' + rawCode + '" -> dropdown "' + code + '"');
            return true;
        }

        // 策略 2：DOM 直连 —— 直接操作目标字段原生 select
        if (writeViaDOM(code)) {
            log('Synced (DOM fallback): language "' + rawCode + '" -> dropdown "' + code + '"');
            return true;
        }

        warn('Failed to write language code "' + code + '" to target field ' + CONFIG.TARGET_FIELD_ID);
        return false;
    }

    /** 策略 1：官方 API 写入 */
    function writeViaOfficialAPI(code) {
        var loader = getLoader();
        if (!loader) { return false; }
        try {
            var dal = loader.getDOMAbstractionLayer
                ? loader.getDOMAbstractionLayer()
                : null;
            if (dal && dal.setControlValueById) {
                dal.setControlValueById(CONFIG.TARGET_FIELD_ID, code);
                return true;
            }
        } catch (e) {
            warn('Official API write failed:', e);
        }
        // 尝试引擎 document 方式
        try {
            var engine = loader.engine || loader.getEngine ? (loader.getEngine ? loader.getEngine() : null) : null;
            if (engine && engine.document && engine.document.getElementById) {
                var field = engine.document.getElementById(CONFIG.TARGET_FIELD_ID);
                if (field && field.setValue) {
                    field.setValue({ value: code });
                    return true;
                }
            }
        } catch (e2) {
            warn('Engine document write failed:', e2);
        }
        return false;
    }

    /** 策略 2：DOM 直连写入 */
    function writeViaDOM(code) {
        var targetSelect = getTargetSelect();
        if (!targetSelect) {
            warn('Target dropdown field not found: ' + CONFIG.TARGET_FIELD_ID);
            return false;
        }

        var matched = false;
        var options = targetSelect.options || [];
        for (var i = 0; i < options.length; i++) {
            if (options[i].value === code || options[i].text === code) {
                targetSelect.value = options[i].value;
                matched = true;
                break;
            }
        }

        if (!matched) {
            warn('No matching option "' + code + '" in target dropdown.');
            return false;
        }

        triggerChange(targetSelect);
        return true;
    }

    /** 兼容地触发 change 事件（原生 + jQuery，如有） */
    function triggerChange(el) {
        try {
            if (window.jQuery && jQuery.fn && jQuery.fn.trigger) {
                jQuery(el).trigger('change');
                return;
            }
        } catch (e) {}
        try {
            var evt = document.createEvent('HTMLEvents');
            evt.initEvent('change', true, false);
            el.dispatchEvent(evt);
        } catch (e2) {
            try {
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e3) {}
        }
    }

    /* =============================================================
     * 事件绑定（事件委托，避免元素重建导致监听丢失）
     * ============================================================= */
    var BOUND_FLAG = '__iniuLangSyncV3Bound';

    function bindOnce() {
        if (document[BOUND_FLAG]) { return; }
        document[BOUND_FLAG] = true;

        document.addEventListener('change', function (event) {
            var target = event.target;
            if (!target) { return; }

            // 判断是否发生在语言选择器容器内（不限定元素类型，
            // 因为自定义 dropdown 组件的 change 可能来自内部原生 select
            // 或组件根节点 div[data-type=dropdown]）。
            var isLangSelector = false;
            if (target.closest) {
                isLangSelector =
                    !!target.closest('[data-type="language-selector"]') ||
                    !!target.closest('[data-role="language-selector"]');
            }
            if (!isLangSelector && target.getAttribute) {
                var role = target.getAttribute('data-role');
                var type = target.getAttribute('data-type');
                isLangSelector =
                    role === 'language-dropdown' ||
                    role === 'language-selector' ||
                    type === 'language-selector';
            }

            if (!isLangSelector) { return; }

            CONFIG.SYNC_DELAYS.forEach(function (delay) {
                setTimeout(syncLanguage, delay);
            });
        });

        log('Language selector bound (event delegation).');
    }

    /* =============================================================
     * 初始化
     * ============================================================= */
    function init() {
        // 1. 多次延迟重试绑定 + 初始同步
        CONFIG.BIND_RETRY_DELAYS.forEach(function (delay) {
            setTimeout(function () {
                bindOnce();
                syncLanguage();
            }, delay);
        });

        // 2. DOM 变化时重新尝试（应对动态渲染）
        try {
            if (typeof MutationObserver === 'function' && document.body) {
                var observer = new MutationObserver(function () {
                    bindOnce();
                });
                observer.observe(document.body, { childList: true, subtree: true });
            }
        } catch (e) {
            warn('MutationObserver init failed:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

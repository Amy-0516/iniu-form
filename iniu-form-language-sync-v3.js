/**
 * INIU Form Language Sync — v3（DOM 直连版：语言切换器 → Dropdown 字段）
 * -------------------------------------------------------------------------
 * 用途：
 *   在 123FormBuilder 表单中，当用户切换页面顶部的「语言切换器」时，
 *   把选中的语言 code 原样写入目标 Dropdown 字段（ID 121884187），
 *   使表单提交时能携带用户所选语言信息（供 Zendesk 按语言自动回复）。
 *
 * v3 相较 v2 的核心修正（从 123FormBuilder 引擎源码 + 运行时 DOM 确认）：
 *   1. 语言切换器 = <select data-role="language-dropdown">，其 option 的
 *      value 即语言 code（如 nl / en / it），与 Dropdown 字段选项完全一致，
 *      因此【直接透传，无需映射】。
 *   2. Dropdown 字段的引擎 setValue 期望「原生 option 的 value 字符串」，
 *      而非 {value:...} 对象；v2 误传对象导致写入失败。
 *   3. v3 改为【直接操作目标字段的原生 <select> DOM】，设置 .value 后主动
 *      trigger change，让 123FormBuilder 自身的监听器捕获并同步字段值。
 *      这是最稳健、不依赖内部引擎 API 的方式。
 *
 * 目标字段运行时 DOM 结构（已确认）：
 *   <div data-role="control" data-id="121884187" ...>
 *       <div data-role="i123-input" data-type="dropdown">
 *           <select>...</select>
 *       </div>
 *   </div>
 *
 * 依赖：无（纯 DOM 操作 + 事件委托，不依赖 loader / Engine 全局对象）。
 *
 * 用法：
 *   1. 在表单「自定义代码 / Custom Code」区域引入本文件（建议用 raw 链接：
 *      https://raw.githubusercontent.com/Amy-0516/iniu-form/main/iniu-form-language-sync-v3.js）
 *   2. 如需改动目标字段 ID，修改下方 CONFIG.TARGET_FIELD_ID。
 *
 * @author  INIU
 * @version 3.0.0
 * -------------------------------------------------------------------------
 */
(function () {
    'use strict';

    var CONFIG = {
        /** 目标 Dropdown 字段 ID（接收语言 code） */
        TARGET_FIELD_ID: '121884187',

        /**
         * 语言切换器候选选择器（按优先级尝试，第一个命中即用）。
         * 已确认真实结构为 <select data-role="language-dropdown">。
         */
        LANGUAGE_SELECTOR: [
            'select[data-role="language-dropdown"]',
            '[data-role="language-dropdown"]',
            '[data-role="language-selector"] select',
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

    /**
     * 获取目标 Dropdown 字段的原生 <select>。
     * 先按 data-id 定位字段容器，再取其中的原生 select。
     */
    function getTargetSelect() {
        // 1. 按 data-id 定位字段容器
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
        // 大小写兜底
        var lower = String(rawCode).toLowerCase();
        if (CONFIG.VALID_CODES[lower]) { return lower; }
        warn('Unsupported language code "' + rawCode + '", fallback to ' + CONFIG.FALLBACK_LANGUAGE);
        return CONFIG.FALLBACK_LANGUAGE;
    }

    /* =============================================================
     * 写入逻辑（核心：直接操作原生 select DOM）
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

        var targetSelect = getTargetSelect();
        if (!targetSelect) {
            warn('Target dropdown field not found: ' + CONFIG.TARGET_FIELD_ID);
            return false;
        }

        // 检查目标 select 是否有该 value 对应的 option
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
            warn('No matching option "' + code + '" in target dropdown. Options:', options);
            return false;
        }

        // 触发 change 事件，让 123FormBuilder 自身监听器捕获并同步字段值
        triggerChange(targetSelect);

        log('Synced: language "' + rawCode + '" -> dropdown "' + code + '"');
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
            if (!target || target.tagName !== 'SELECT') { return; }

            // 仅处理语言切换器
            var isLangSelector =
                target.getAttribute('data-role') === 'language-dropdown' ||
                target.getAttribute('data-role') === 'language-selector' ||
                (target.closest && target.closest('[data-role="language-selector"]'));

            if (!isLangSelector) { return; }

            // 分多次延迟写入，等待表单引擎完成语言重渲染
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
        if (typeof MutationObserver === 'function') {
            var observer = new MutationObserver(function () {
                bindOnce();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

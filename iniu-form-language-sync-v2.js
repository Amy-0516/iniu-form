/**
 * INIU Form Language Sync — v2（最终版：语言切换器 → Dropdown 字段）
 * -------------------------------------------------------------------------
 * 用途：
 *   在 123FormBuilder 表单中，监听页面顶部的「语言切换器」
 *   （<select data-role="language-dropdown">），当用户切换语言时，
 *   把选中的语言 code 原样写入目标 Dropdown 字段（ID 121884187），
 *   使表单提交时能够携带用户所选择的语言信息。
 *
 * 关键事实（从表单真实 DOM 确认）：
 *   - 语言切换器 = <select data-role="language-dropdown">，option value 为语言 code
 *     （Languages: en/it/es/fr/nl/sa/dk/pl/ie/pt/fi/se/jp/de，共 14 个）
 *   - 目标 Dropdown 字段 ID = 121884187，选项为
 *     en/dk/de/pt/es/fr/it/nl/pl/fi/se/sa/jp（共 13 个，不含 ie）
 *   - 两套 code 完全一致，因此【直接透传，无需映射】
 *
 * 依赖：
 *   - 123FormBuilder 的全局 `loader` 对象（用于获取引擎 / 文档实例）。
 *
 * 用法：
 *   1. 在表单的「自定义代码 / Custom Code」区域引入本文件；
 *   2. 如需改动目标字段 ID，修改下方 CONFIG.TARGET_FIELD_ID。
 *
 * @author  INIU
 * @version 2.1.0
 * -------------------------------------------------------------------------
 */
(function () {
    'use strict';

    /* =========================================================================
     * 配置区（按需修改）
     * ========================================================================= */
    var CONFIG = {
        /** 目标 Dropdown 字段的 ID（用于接收语言 code） */
        TARGET_FIELD_ID: 121884187,

        /**
         * 语言切换器的候选 CSS 选择器（按优先级依次尝试）。
         * 第一个命中的将被使用。若都未命中，会回退到「页面上唯一的 select」。
         * 正确属性为 data-role="language-dropdown"。
         */
        LANGUAGE_SELECTOR: [
            'select[data-role="language-dropdown"]',
            '[data-role="language-dropdown"]',
            'select[data-type="language-selector"]',
            '.language-selector select'
        ],

        /**
         * Dropdown 目标字段支持的选项值集合。
         * 语言切换器可能返回这些之外的值（如 ie），此时按 FALLBACK_STRATEGY 兜底。
         */
        VALID_CODES: {
            en: true, dk: true, de: true, pt: true, es: true,
            fr: true, it: true, nl: true, pl: true, fi: true,
            se: true, sa: true, jp: true
        },

        /**
         * 当语言 code 不在 Dropdown 选项内时的兜底策略：
         *   'en'   - 回退为英文（默认，安全）
         *   ''     - 写入空值（不写入）
         *   'raw'  - 强行原样写入（可能导致 Dropdown 无法选中）
         */
        FALLBACK_STRATEGY: 'en',

        /** 绑定标志（用于防止重复绑定事件） */
        BIND_FLAG: 'iniuLanguageBound',

        /** 页面加载后，尝试绑定语言选择器的延迟时间点（毫秒） */
        BIND_RETRY_DELAYS: [300, 800, 1500, 3000],

        /** 语言切换后，写入目标字段的延迟（毫秒），用于等待表单引擎就绪 */
        SYNC_DELAYS: [100, 500],

        /** 是否输出调试日志 */
        DEBUG: true
    };

    /* =========================================================================
     * 工具函数
     * ========================================================================= */

    /**
     * 输出调试日志（仅当 CONFIG.DEBUG 为 true 时）。
     * @param {string} level - 日志级别（info / warn / error）
     * @param {...*} args - 日志内容
     */
    function log(level, args) {
        if (!CONFIG.DEBUG) {
            return;
        }
        var prefix = '[iNIU] Form Language Sync v2';
        if (level === 'error' && typeof console.error === 'function') {
            console.error(prefix, args);
        } else if (level === 'warn' && typeof console.warn === 'function') {
            console.warn(prefix, args);
        } else if (typeof console.log === 'function') {
            console.log(prefix, args);
        }
    }

    /**
     * 获取页面上的语言切换器元素（<select data-role="language-dropdown">）。
     * 依次尝试 CONFIG.LANGUAGE_SELECTOR 中的候选选择器；
     * 若都未命中，且页面仅存在一个 select，则回退到该 select。
     * @returns {HTMLSelectElement|null} 语言切换器，或 null（未找到）。
     */
    function getLanguageSelect() {
        var i, el;

        // 1. 依次尝试候选选择器
        for (i = 0; i < CONFIG.LANGUAGE_SELECTOR.length; i++) {
            el = document.querySelector(CONFIG.LANGUAGE_SELECTOR[i]);
            if (el) {
                return el;
            }
        }

        // 2. 回退：页面只有一个 select 时，直接使用它
        var allSelects = document.querySelectorAll('select');
        if (allSelects.length === 1) {
            log('info', 'Fallback: using the only <select> on page.');
            return allSelects[0];
        }

        return null;
    }

    /**
     * 获取 123FormBuilder 表单引擎中的文档实例。
     * 若 loader 或引擎尚未就绪，返回 null。
     * @returns {object|null} 表单文档实例，或 null。
     */
    function getFormDocument() {
        try {
            if (typeof loader === 'undefined' || !loader) {
                return null;
            }
            var engine = loader.getEngine();
            if (!engine) {
                return null;
            }
            return engine.getDocument();
        } catch (error) {
            log('error', 'Failed to access form engine: ' + error.message);
            return null;
        }
    }

    /**
     * 规范化语言 code：校验是否在 Dropdown 支持的选项内，必要时兜底。
     * @param {string} rawCode - 语言切换器返回的 code。
     * @returns {string} 最终写入 Dropdown 字段的 code。
     */
    function normalizeLanguageCode(rawCode) {
        if (!rawCode) {
            return '';
        }

        // 命中合法选项，直接透传
        if (Object.prototype.hasOwnProperty.call(CONFIG.VALID_CODES, rawCode)) {
            return rawCode;
        }

        // 未命中（如 ie），按兜底策略处理
        if (CONFIG.FALLBACK_STRATEGY === '') {
            log('warn', 'Unsupported language code, writing empty: ' + rawCode);
            return '';
        } else if (CONFIG.FALLBACK_STRATEGY === 'raw') {
            log('warn', 'Unsupported language code, passing through: ' + rawCode);
            return rawCode;
        } else {
            // 默认 'en'
            log('warn', 'Unsupported language code "' + rawCode + '", fallback to en.');
            return 'en';
        }
    }

    /**
     * 将当前语言 code 写入目标 Dropdown 字段。
     * @returns {boolean} 是否成功写入。
     */
    function setFormLanguage() {
        try {
            var languageSelect = getLanguageSelect();
            if (!languageSelect) {
                return false;
            }

            var rawCode = languageSelect.value;
            if (!rawCode) {
                return false;
            }

            var languageCode = normalizeLanguageCode(rawCode);
            if (!languageCode) {
                return false;
            }

            var documentInstance = getFormDocument();
            if (!documentInstance) {
                return false;
            }

            var targetField = documentInstance.getElementById(CONFIG.TARGET_FIELD_ID);
            if (!targetField) {
                log('warn', 'Target field not found: ' + CONFIG.TARGET_FIELD_ID);
                return false;
            }

            // Dropdown 字段写入：需要匹配到对应 option 的 index
            // 先尝试 setValue({value})，若字段是下拉则需按 choices 匹配
            targetField.setValue({
                value: languageCode
            });

            log('info', 'Form Language synced: ' + rawCode + ' -> ' + languageCode);
            return true;
        } catch (error) {
            log('error', 'Form Language sync error: ' + error.message);
            return false;
        }
    }

    /**
     * 为语言切换器绑定 change 事件。
     * 使用「事件委托」绑定到 document，即使语言切换器被重新渲染也不会丢失监听。
     * @returns {boolean} 是否成功找到选择器（用于日志提示）。
     */
    function bindLanguageSelector() {
        var languageSelect = getLanguageSelect();
        if (!languageSelect) {
            return false;
        }

        // 事件委托：document 级监听 change，避免元素重建导致监听丢失
        if (!document[CONFIG.BIND_FLAG]) {
            document.addEventListener('change', function (event) {
                var target = event.target;
                if (!target || target.tagName !== 'SELECT') {
                    return;
                }

                // 仅处理语言切换器（data-role="language-dropdown"）
                if (target.getAttribute('data-role') !== 'language-dropdown') {
                    return;
                }

                // 分两次延迟写入，确保表单引擎完成语言切换后再同步
                CONFIG.SYNC_DELAYS.forEach(function (delay) {
                    setTimeout(setFormLanguage, delay);
                });
            });

            document[CONFIG.BIND_FLAG] = true;
            log('info', 'Language selector bound (event delegation).');
        }

        // 初始化时同步一次当前语言
        setFormLanguage();

        return true;
    }

    /* =========================================================================
     * 初始化
     * ========================================================================= */

    function init() {
        // 1. 页面加载后，按延迟时间点多次尝试绑定（应对选择器动态渲染）
        CONFIG.BIND_RETRY_DELAYS.forEach(function (delay) {
            setTimeout(bindLanguageSelector, delay);
        });

        // 2. 监听 DOM 变化，一旦语言切换器出现则立即绑定
        if (typeof MutationObserver === 'function') {
            var observer = new MutationObserver(function () {
                bindLanguageSelector();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // 等待 DOM 就绪后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

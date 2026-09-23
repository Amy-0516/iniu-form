/**
 * INIU Form Language Sync — v2 (下拉值映射版)
 * -------------------------------------------------------------------------
 * 用途：
 *   在 123FormBuilder 表单中，监听页面上的「语言选择器」（language-selector），
 *   当用户切换语言时，将选中的「下拉值」映射为 ISO 语言代码，
 *   再写入一个隐藏的目标字段，使表单提交时能够携带用户所选择的语言信息。
 *
 * 与 v1 的区别：
 *   - v1 直接把下拉值写入目标字段；
 *   - v2 增加了一层「下拉值 → ISO 语言代码」的映射（见 LANGUAGE_MAP）。
 *
 * 依赖：
 *   - 123FormBuilder 的全局 `loader` 对象（用于获取引擎 / 文档实例）。
 *   - 页面上存在 `[data-type="language-selector"] select` 元素。
 *
 * 用法：
 *   1. 在表单的「自定义代码 / Custom Code」区域引入本文件；
 *   2. 按需修改下方 CONFIG 中的 TARGET_FIELD_ID 为目标字段 ID；
 *   3. 按需调整 LANGUAGE_MAP 中的下拉值 → ISO 代码映射。
 *
 * @author  INIU
 * @version 2.0.0
 * -------------------------------------------------------------------------
 */
(function () {
    'use strict';

    /* =========================================================================
     * 配置区（按需修改）
     * ========================================================================= */
    var CONFIG = {
        /** 隐藏目标字段的 ID（用于接收语言代码） */
        TARGET_FIELD_ID: 121872774,

        /** 语言选择器的 CSS 选择器 */
        LANGUAGE_SELECTOR: '[data-type="language-selector"] select',

        /**
         * 下拉值 → ISO 语言代码 映射表。
         * key   = 语言选择器（下拉）的 option value
         * value = 最终写入 Zendesk / 目标字段的 ISO 语言代码
         */
        LANGUAGE_MAP: {
            en: 'en',   // English
            dk: 'da',   // Danish
            de: 'de',   // German
            pt: 'pt',   // Portuguese
            es: 'es',   // Spanish
            fr: 'fr',   // French
            it: 'it',   // Italian
            nl: 'nl',   // Dutch
            pl: 'pl',   // Polish
            fi: 'fi',   // Finnish
            se: 'sv',   // Swedish
            sa: 'ar',   // Arabic
            jp: 'ja',   // Japanese
            ie: 'ga'    // Irish
        },

        /**
         * 当下拉值不在映射表中时的兜底策略：
         *   'value'  - 原样写入下拉值（默认）
         *   ''       - 写入空值（不写入）
         *   'en'     - 回退为英文
         */
        FALLBACK_STRATEGY: 'value',

        /** 绑定标志（用于防止重复绑定事件） */
        BIND_FLAG: 'iniuLanguageBound',

        /** 页面加载后，尝试绑定语言选择器的延迟时间点（毫秒） */
        BIND_RETRY_DELAYS: [500, 1500, 3000],

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
     * 获取页面上的语言选择器元素。
     * @returns {HTMLSelectElement|null} 语言选择器，或 null（未找到）。
     */
    function getLanguageSelect() {
        return document.querySelector(CONFIG.LANGUAGE_SELECTOR);
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
     * 将「下拉值」映射为最终写入的 ISO 语言代码。
     * @param {string} rawValue - 语言选择器的原始 value。
     * @returns {string} 映射后的语言代码。
     */
    function mapLanguageCode(rawValue) {
        if (Object.prototype.hasOwnProperty.call(CONFIG.LANGUAGE_MAP, rawValue)) {
            return CONFIG.LANGUAGE_MAP[rawValue];
        }

        // 未命中映射表时的兜底策略
        if (CONFIG.FALLBACK_STRATEGY === '') {
            log('warn', 'Unmapped language value, writing empty: ' + rawValue);
            return '';
        } else if (CONFIG.FALLBACK_STRATEGY === 'en') {
            log('warn', 'Unmapped language value, fallback to en: ' + rawValue);
            return 'en';
        } else {
            // 默认 'value'：原样透传
            log('warn', 'Unmapped language value, passing through: ' + rawValue);
            return rawValue;
        }
    }

    /**
     * 将当前语言代码（映射后）写入目标字段。
     * @returns {boolean} 是否成功写入。
     */
    function setFormLanguage() {
        try {
            var languageSelect = getLanguageSelect();
            if (!languageSelect) {
                return false;
            }

            var rawValue = languageSelect.value;
            if (!rawValue) {
                return false;
            }

            var languageCode = mapLanguageCode(rawValue);
            if (!languageCode) {
                return false;
            }

            var documentInstance = getFormDocument();
            if (!documentInstance) {
                return false;
            }

            var targetField = documentInstance.getElementById(CONFIG.TARGET_FIELD_ID);
            if (!targetField) {
                return false;
            }

            targetField.setValue({
                value: languageCode
            });

            log('info', 'Form Language synced: ' + rawValue + ' -> ' + languageCode);
            return true;
        } catch (error) {
            log('error', 'Form Language sync error: ' + error.message);
            return false;
        }
    }

    /**
     * 为语言选择器绑定 change 事件（仅绑定一次）。
     * @returns {boolean} 是否成功找到并（重新）初始化了选择器。
     */
    function bindLanguageSelector() {
        var languageSelect = getLanguageSelect();
        if (!languageSelect) {
            return false;
        }

        // 防止重复绑定
        if (languageSelect.dataset[CONFIG.BIND_FLAG] !== '1') {
            languageSelect.addEventListener('change', function () {
                // 分两次延迟写入，确保表单引擎完成语言切换后再同步
                CONFIG.SYNC_DELAYS.forEach(function (delay) {
                    setTimeout(setFormLanguage, delay);
                });
            });

            languageSelect.dataset[CONFIG.BIND_FLAG] = '1';
            log('info', 'Language selector bound.');
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

        // 2. 监听 DOM 变化，一旦语言选择器出现则立即绑定
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

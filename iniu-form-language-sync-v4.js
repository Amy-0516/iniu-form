/**
 * INIU Form Language Sync — v4（语言切换器 → Dropdown 字段 121884187）
 * -------------------------------------------------------------------------
 * 用途：
 *   用户切换 123FormBuilder 表单顶部的「语言切换器」时，把选中的语言 code
 *   原样写入目标 Dropdown 字段（ID 121884187），使表单提交时携带语言信息，
 *   供 Zendesk 按语言发送对应语种的自动回复邮件。
 *
 * 本版基于 GPT 简洁版重构，但修正了其中两个会导致失败的已知问题：
 *   1. 引擎字段的 setValue 期望【字符串】而非对象，原 {value: code} 会失败；
 *      改用「官方 API setControlValueById 优先 + DOM 直连原生 select 兜底」。
 *   2. 语言切换器渲染后经 upgradeDropdown() 升级为自定义组件，data-role
 *      被改为 "i123-input"，原本的 [data-type="language-selector"] select
 *      可能取不到；改用容器定位：
 *        div[data-role="control"][data-type="language-selector"] select
 *
 * 目标字段运行时 DOM（已确认）：
 *   <div data-role="control" data-id="121884187">
 *       <div data-role="i123-input" data-type="dropdown"><select>…</select></div>
 *   </div>
 *
 * 用法（重要）：
 *   在表单 Advanced → Form → "Add a JS script to your form" 粘贴下方 URL：
 *      https://amy-0516.github.io/iniu-form/iniu-form-language-sync-v4.js
 *   ⚠️ 必须用 GitHub Pages 链接（application/javascript MIME）。
 *   ❌ 不要用 raw.githubusercontent.com（text/plain，Chrome 拒绝执行）。
 *
 * @version 4.0.0
 */
(function () {
    'use strict';

    var TARGET_FIELD_ID = '121884187';

    /* ---------- 日志 ---------- */
    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[iNIU] Language Sync v4');
        try { console.log.apply(console, args); } catch (e) {}
    }

    /* ---------- 获取语言切换器原生 select ---------- */
    function getLanguageSelector() {
        var selectors = [
            'div[data-role="control"][data-type="language-selector"] select',
            'div[data-role="control"][data-type="language-selector"] [data-type="dropdown"] select',
            '[data-type="language-selector"] select',
            '[data-role="language-selector"] select',
            'select[data-role="language-dropdown"]'
        ];
        for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (el) { return el; }
        }
        return null;
    }

    /* ---------- 获取目标 Dropdown 字段的原生 select ---------- */
    function getTargetSelect() {
        var container = document.querySelector(
            '[data-role="control"][data-id="' + TARGET_FIELD_ID + '"],' +
            '[data-id="' + TARGET_FIELD_ID + '"]'
        );
        if (container) {
            var native = container.querySelector('select');
            if (native) { return native; }
        }
        return null;
    }

    /* ---------- 触发 change（原生 + jQuery 兼容） ---------- */
    function triggerChange(el) {
        try {
            if (window.jQuery && jQuery.fn && jQuery.fn.trigger) {
                jQuery(el).trigger('change');
                return;
            }
        } catch (e) {}
        try {
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e2) {
            try {
                var evt = document.createEvent('HTMLEvents');
                evt.initEvent('change', true, false);
                el.dispatchEvent(evt);
            } catch (e3) {}
        }
    }

    /* ---------- 写入目标字段：官方 API 优先，DOM 直连兜底 ---------- */
    function writeValue(code) {
        // 策略 1：官方 API
        try {
            if (window.loader && window.loader.getDOMAbstractionLayer) {
                var dal = window.loader.getDOMAbstractionLayer();
                if (dal && dal.setControlValueById) {
                    dal.setControlValueById(TARGET_FIELD_ID, code);
                    return true;
                }
            }
        } catch (e) {}

        // 策略 2：引擎 document（注意 setValue 传字符串，不是对象）
        try {
            var engine = window.loader && window.loader.engine;
            if (engine && engine.document && engine.document.getElementById) {
                var field = engine.document.getElementById(TARGET_FIELD_ID);
                if (field && field.setValue) {
                    field.setValue(code);
                    return true;
                }
            }
        } catch (e) {}

        // 策略 3：DOM 直连原生 select
        var targetSelect = getTargetSelect();
        if (!targetSelect) {
            log('Target dropdown field not found: ' + TARGET_FIELD_ID);
            return false;
        }
        var options = targetSelect.options || [];
        var matched = false;
        for (var i = 0; i < options.length; i++) {
            if (options[i].value === code || options[i].text === code) {
                targetSelect.value = options[i].value;
                matched = true;
                break;
            }
        }
        if (!matched) {
            log('No matching option "' + code + '" in target dropdown.');
            return false;
        }
        triggerChange(targetSelect);
        return true;
    }

    /* ---------- 同步主逻辑 ---------- */
    function syncLanguage() {
        try {
            var languageSelector = getLanguageSelector();
            if (!languageSelector) {
                return;
            }
            var languageCode = languageSelector.value;
            if (!languageCode) {
                return;
            }
            if (writeValue(languageCode)) {
                log('Language synced:', languageCode);
            }
        } catch (error) {
            console.error('[iNIU] Language sync failed:', error);
        }
    }

    /* ---------- 绑定 + 初始化 ---------- */
    function bind() {
        var languageSelector = getLanguageSelector();
        if (!languageSelector) {
            return;
        }
        if (languageSelector.dataset.iniuBound !== 'true') {
            languageSelector.addEventListener('change', function () {
                setTimeout(syncLanguage, 100);
                setTimeout(syncLanguage, 500);
                setTimeout(syncLanguage, 1200);
            });
            languageSelector.dataset.iniuBound = 'true';
            log('Language selector bound.');
        }
        syncLanguage();
    }

    var retryDelays = [300, 1000, 2000, 4000];
    retryDelays.forEach(function (delay) {
        setTimeout(bind, delay);
    });

    try {
        var observer = new MutationObserver(function () {
            bind();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
})();

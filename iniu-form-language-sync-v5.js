(function () {
    const TARGET_FIELD_ID = '121884187';

    function getLanguageSelector() {
        return document.querySelector(
            '[data-type="language-selector"] select'
        );
    }

    function getTargetDropdown() {
        // 优先按123字段结构查找
        const control = document.querySelector(
            '[data-typeid="' + TARGET_FIELD_ID + '"], ' +
            '[data-id="' + TARGET_FIELD_ID + '"], ' +
            '[data-field-id="' + TARGET_FIELD_ID + '"]'
        );

        if (control) {
            const select = control.querySelector('select');
            if (select) return select;
        }

        // 兼容123常见的control ID/name结构
        return document.querySelector(
            '#id' + TARGET_FIELD_ID + ', ' +
            '#control' + TARGET_FIELD_ID + ', ' +
            'select[name*="' + TARGET_FIELD_ID + '"]'
        );
    }

    function syncLanguage() {
        const languageSelector = getLanguageSelector();
        const targetDropdown = getTargetDropdown();

        if (!languageSelector) {
            console.warn('[iNIU] Language selector not found');
            return;
        }

        if (!targetDropdown) {
            console.warn(
                '[iNIU] Form Language dropdown not found:',
                TARGET_FIELD_ID
            );
            return;
        }

        const languageCode = languageSelector.value;

        const optionExists = Array.from(targetDropdown.options)
            .some(option => option.value === languageCode);

        if (!optionExists) {
            console.warn(
                '[iNIU] No matching Form Language option:',
                languageCode
            );
            return;
        }

        targetDropdown.value = languageCode;

        targetDropdown.dispatchEvent(
            new Event('input', { bubbles: true })
        );

        targetDropdown.dispatchEvent(
            new Event('change', { bubbles: true })
        );

        console.log(
            '[iNIU] Language synced:',
            languageCode
        );
    }

    function init() {
        const languageSelector = getLanguageSelector();

        if (!languageSelector) {
            setTimeout(init, 500);
            return;
        }

        if (!languageSelector.dataset.iniuLanguageSync) {
            languageSelector.addEventListener('change', function () {
                setTimeout(syncLanguage, 200);
                setTimeout(syncLanguage, 800);
            });

            languageSelector.dataset.iniuLanguageSync = '1';
        }

        syncLanguage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    const observer = new MutationObserver(function () {
        const languageSelector = getLanguageSelector();

        if (
            languageSelector &&
            !languageSelector.dataset.iniuLanguageSync
        ) {
            init();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();

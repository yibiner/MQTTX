import VueI18n from 'vue-i18n'

type FormatLang = {
  [key in Language]?: any
}

export const formati18n = (transItems: i18nLocaleModel, langs: SupportLangModel): VueI18n.LocaleMessages => {
  const formatLang: FormatLang = {}
  langs.forEach((lang) => {
    // One bucket per module, taken from the caller's list: a new language module must not have to be
    // added in two places (here and in `lang/index.ts`) or its keys are silently dropped.
    formatLang[lang] = {}
    transItems.forEach((item) => {
      formatLang[lang]![item] = {}
    })
  })
  transItems.forEach((item) => {
    const values = require(`@/lang/${item}`).default
    Object.keys(values).forEach((key: string) => {
      langs.forEach((lang) => {
        formatLang[lang][item][key] = values[key][lang]
      })
    })
  })
  return formatLang
}

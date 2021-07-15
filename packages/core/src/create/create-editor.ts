/**
 * @description create editor
 * @author wangfupeng
 */

import { createEditor, Descendant } from 'slate'
import { withHistory } from 'slate-history'
import { withDOM } from '../editor/plugins/with-dom'
import { withConfig } from '../editor/plugins/with-config'
import { withContent } from '../editor/plugins/with-content'
import { withEventData } from '../editor/plugins/with-event-data'
import { withEmitter } from '../editor/plugins/with-emitter'
import { withSelection } from '../editor/plugins/with-selection'
import TextArea from '../text-area/TextArea'
import HoverBar from '../menus/bar/HoverBar'
import { genEditorConfig } from '../config/index'
import { IDomEditor } from '../editor/interface'
import { DomEditor } from '../editor/dom-editor'
import { IEditorConfig } from '../config/interface'
import { promiseResolveThen } from '../utils/util'
import { isRepeatedCreate, genDefaultContent } from './helper'
import { DOMElement } from '../utils/dom'
import {
  EDITOR_TO_TEXTAREA,
  TEXTAREA_TO_EDITOR,
  EDITOR_TO_CONFIG,
  HOVER_BAR_TO_EDITOR,
  EDITOR_TO_HOVER_BAR,
} from '../utils/weak-maps'

type PluginFnType = <T extends IDomEditor>(editor: T) => T

interface ICreateOption {
  textareaSelector: string | DOMElement
  config: Partial<IEditorConfig>
  content: Descendant[]
  plugins: PluginFnType[]
}

/**
 * 创建编辑器
 */
export default function (option: Partial<ICreateOption>) {
  const { textareaSelector = '', config = {}, content, plugins = [] } = option

  // 创建实例 - 使用插件
  let editor = withHistory(
    withEmitter(withSelection(withContent(withConfig(withDOM(withEventData(createEditor()))))))
  )
  if (textareaSelector) {
    // 检查是否对同一个 DOM 重复创建
    if (isRepeatedCreate(editor, textareaSelector)) {
      throw new Error(`Repeated create editor by textareaSelector '${textareaSelector}'`)
    }
  }

  // 处理配置
  const editorConfig = genEditorConfig(config)
  EDITOR_TO_CONFIG.set(editor, editorConfig)
  const { hoverbarKeys = [] } = editorConfig

  // editor plugins
  plugins.forEach(plugin => {
    editor = plugin(editor)
  })

  // 初始化内容（要在 config 和 plugins 后面）
  if (content && content.length) {
    editor.children = content
  } else {
    editor.children = genDefaultContent()
  }
  DomEditor.normalizeContent(editor) // 格式化，用户输入的 content 可能不规范（如两个相连的 text 没有合并）

  if (textareaSelector) {
    // 创建 textarea DOM
    const textarea = new TextArea(textareaSelector)
    EDITOR_TO_TEXTAREA.set(editor, textarea)
    TEXTAREA_TO_EDITOR.set(textarea, editor)
    textarea.changeViewState() // 初始化时触发一次，以便能初始化 textarea DOM 和 selection

    // 判断 textarea 最小高度，并给出提示
    promiseResolveThen(() => {
      const $textarea = textarea.$textArea
      if ($textarea == null) return
      if ($textarea.height() < 300) {
        let info = '编辑区域高度 < 300px 这可能会导致 modal hoverbar 定位异常'
        info += '\nTextarea height < 300px . This may be cause modal and hoverbar position error'
        console.warn(info, $textarea)
      }
    })

    // 创建 hoverbar DOM
    let hoverbar: HoverBar | null
    if (hoverbarKeys.length > 0) {
      hoverbar = new HoverBar()
      HOVER_BAR_TO_EDITOR.set(hoverbar, editor)
      EDITOR_TO_HOVER_BAR.set(editor, hoverbar)
    }

    // 隐藏 panel and modal
    editor.on('change', () => {
      editor.hidePanelOrModal()
    })
    editor.on('scroll', () => {
      editor.hidePanelOrModal()
    })
  }

  // 触发生命周期
  const { onCreated, onChange, onDestroyed } = editorConfig
  if (onCreated) {
    editor.on('created', () => onCreated(editor))
  }
  if (onChange) {
    editor.on('change', () => onChange(editor))
  }
  if (onDestroyed) {
    editor.on('destroyed', () => onDestroyed(editor))
  }

  // 创建完毕，异步触发 created
  promiseResolveThen(() => editor.emit('created'))

  return editor
}

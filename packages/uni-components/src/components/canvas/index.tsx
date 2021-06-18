import { ref, computed, ExtractPropTypes, Ref, onMounted } from 'vue'
import { extend } from '@vue/shared'
import type { Actions } from '@dcloudio/uni-api'
import {
  useAttrs,
  useContextInfo,
  useSubscribe,
  withWebEvent,
  defineBuiltInComponent,
} from '@dcloudio/uni-components'
import { getCurrentPageId, onEventPrevent } from '@dcloudio/uni-core'
import {
  saveImage,
  getSameOriginUrl,
  getRealPath,
} from '@dcloudio/uni-platform'
import ResizeSensor from '../resize-sensor'
import { useNativeEvent, NativeEventTrigger } from '../../helpers/useEvent'
import { pixelRatio, wrapper, initHidpi } from '../../helpers/hidpi'
import { once } from '@dcloudio/uni-shared'

const initHidpiOnce = /*#__PURE__*/ once(initHidpi)

function $getRealPath(src: string) {
  return src ? getRealPath(src) : src
}

function resolveColor(color: number[]) {
  color = color.slice(0)
  color[3] = color[3] / 255
  return 'rgba(' + color.join(',') + ')'
}

function processTouches(target: EventTarget, touches: TouchEvent['touches']) {
  const eventTarget = target as HTMLElement
  return Array.from(touches).map((touch) => {
    let boundingClientRect = eventTarget.getBoundingClientRect()
    return {
      identifier: touch.identifier,
      x: touch.clientX - boundingClientRect.left,
      y: touch.clientY - boundingClientRect.top,
    }
  })
}

let tempCanvas: HTMLCanvasElement
function getTempCanvas(width = 0, height = 0) {
  if (!tempCanvas) {
    tempCanvas = document.createElement('canvas')
  }
  tempCanvas.width = width
  tempCanvas.height = height
  return tempCanvas
}

const props = {
  canvasId: {
    type: String,
    default: '',
  },
  disableScroll: {
    type: [Boolean, String],
    default: false,
  },
}

type Props = ExtractPropTypes<typeof props>

export default /*#__PURE__*/ defineBuiltInComponent({
  inheritAttrs: false,
  name: 'Canvas',
  compatConfig: {
    MODE: 3,
  },
  props,
  computed: {
    id(): Props['canvasId'] {
      return this.canvasId
    },
  },
  setup(props, { emit, slots }) {
    initHidpiOnce()
    const canvas = ref<HTMLCanvasElement | null>(null)
    const sensor = ref<HTMLElement | null>(null)
    const actionsWaiting = ref(false)
    const trigger = useNativeEvent(emit)
    const { $attrs, $excludeAttrs, $listeners } = useAttrs({
      excludeListeners: true,
    })
    const { _listeners } = useListeners(props, $listeners, trigger)

    const { _handleSubscribe, _resize } = useMethods(canvas, actionsWaiting)

    useSubscribe(
      _handleSubscribe as (type: string, data: unknown) => void,
      useContextInfo(props.canvasId),
      true
    )

    onMounted(() => {
      _resize()
    })

    return () => {
      const { canvasId, disableScroll } = props
      return (
        <uni-canvas
          canvas-id={canvasId}
          disable-scroll={disableScroll}
          {...$attrs.value}
          {...$excludeAttrs.value}
          {..._listeners.value}
        >
          <canvas
            ref={canvas}
            class="uni-canvas-canvas"
            width="300"
            height="150"
          />
          <div style="position: absolute;top: 0;left: 0;width: 100%;height: 100%;overflow: hidden;">
            {slots.default && slots.default()}
          </div>
          {/* @ts-ignore */}
          <ResizeSensor ref={sensor} onResize={_resize} />
        </uni-canvas>
      )
    }
  },
})

function useListeners(
  props: Props,
  Listeners: Ref<{}>,
  trigger: NativeEventTrigger
) {
  const _listeners = computed(() => {
    let events = ['onTouchstart', 'onTouchmove', 'onTouchend']
    let _$listeners = Listeners.value
    let $listeners = extend(
      {},
      (() => {
        let obj = {}
        for (const key in _$listeners) {
          if (Object.prototype.hasOwnProperty.call(_$listeners, key)) {
            const event = (_$listeners as any)[key]
            ;(obj as any)[key] = event
          }
        }
        return obj
      })()
    )
    events.forEach((event) => {
      let existing = ($listeners as any)[event]
      let eventHandler = []
      if (existing) {
        eventHandler.push(
          withWebEvent(($event) => {
            trigger(
              event.replace('on', '').toLocaleLowerCase(),
              extend(
                {},
                // $event无法直接assign
                (() => {
                  let obj = {}
                  for (const key in $event) {
                    ;(obj as any)[key] = $event[key]
                  }
                  return obj
                })(),
                {
                  touches: processTouches($event.currentTarget, $event.touches),
                  changedTouches: processTouches(
                    $event.currentTarget,
                    $event.changedTouches
                  ),
                }
              ) as unknown as Event
            )
          })
        )
      }
      if (props.disableScroll && event === 'onTouchmove') {
        eventHandler.push(onEventPrevent)
      }
      ;($listeners as any)[event] = eventHandler
    })
    return $listeners
  })

  return {
    _listeners,
  }
}

function useMethods(
  canvasRef: Ref<HTMLCanvasElement | null>,
  actionsWaiting: Ref<boolean>
) {
  let _actionsDefer: Array<[Actions, boolean, number?]> = []
  let _images: {
    [key: string]: HTMLImageElement & { ready: boolean }
  } = {}

  function _resize() {
    var canvas = canvasRef.value!
    if (canvas.width > 0 && canvas.height > 0) {
      var context = canvas.getContext('2d')!
      var imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      wrapper(canvas)
      context.putImageData(imageData, 0, 0)
    } else {
      wrapper(canvas)
    }
  }
  function actionsChanged({
    actions,
    reserve,
    callbackId,
  }: {
    actions: Actions
    reserve: boolean
    callbackId: number
  }) {
    if (!actions) {
      return
    }
    if (actionsWaiting.value) {
      _actionsDefer.push([actions, reserve, callbackId])
      return
    }
    var canvas = canvasRef.value!
    var c2d = canvas.getContext('2d')!
    if (!reserve) {
      c2d.fillStyle = '#000000'
      c2d.strokeStyle = '#000000'
      c2d.shadowColor = '#000000'
      c2d.shadowBlur = 0
      c2d.shadowOffsetX = 0
      c2d.shadowOffsetY = 0
      c2d.setTransform(1, 0, 0, 1, 0, 0)
      c2d.clearRect(0, 0, canvas.width, canvas.height)
    }
    preloadImage(actions)
    for (let index = 0; index < actions.length; index++) {
      type MultipleArray = Array<Array<number | string | number[]>>
      type LinearGradient = Parameters<
        CanvasFillStrokeStyles['createLinearGradient']
      >
      const action = actions[index]
      let method = action.method
      const data = action.data as Array<string | LinearGradient | MultipleArray>
      if (/^set/.test(method) && method !== 'setTransform') {
        const method1 = method[3].toLowerCase() + method.slice(4)
        let color: CanvasGradient | string
        if (method1 === 'fillStyle' || method1 === 'strokeStyle') {
          if (data[0] === 'normal') {
            color = resolveColor(data[1] as number[])
          } else if (data[0] === 'linear') {
            const LinearGradient = c2d.createLinearGradient(
              ...(data[1] as LinearGradient)
            )
            ;(data[2] as MultipleArray).forEach(function (data2) {
              const offset = data2[0] as number
              const color = resolveColor(data2[1] as number[])
              LinearGradient.addColorStop(offset, color)
            })
            color = LinearGradient
          } else if (data[0] === 'radial') {
            const x = data[1][0] as number
            const y = data[1][1] as number
            const r = data[1][2] as number
            const LinearGradient = c2d.createRadialGradient(x, y, 0, x, y, r)
            // @ts-ignore
            data[2].forEach(function (data2) {
              const offset = data2[0]
              const color = resolveColor(data2[1])
              LinearGradient.addColorStop(offset, color)
            })
            color = LinearGradient
          } else if (data[0] === 'pattern') {
            const loaded = checkImageLoaded(
              data[1] as string,
              actions.slice(index + 1),
              callbackId,
              function (image) {
                if (image) {
                  c2d[method1] = c2d.createPattern(image, data[2] as string)!
                }
              }
            )
            if (!loaded) {
              break
            }
            continue
          }
          c2d[method1] = color!
        } else if (method1 === 'globalAlpha') {
          c2d[method1] = Number(data[0]) / 255
        } else if (method1 === 'shadow') {
          var _ = [
            'shadowOffsetX',
            'shadowOffsetY',
            'shadowBlur',
            'shadowColor',
          ]
          data.forEach(function (color_, method_) {
            // @ts-ignore
            c2d[_[method_]] =
              // @ts-ignore
              _[method_] === 'shadowColor' ? resolveColor(color_) : color_
          })
        } else if (method1 === 'fontSize') {
          // @ts-ignore
          const font = c2d.__font__ || c2d.font
          // @ts-ignore
          c2d.__font__ = c2d.font = font.replace(/\d+\.?\d*px/, data[0] + 'px')
        } else if (method1 === 'lineDash') {
          // @ts-ignore
          c2d.setLineDash(data[0])
          // @ts-ignore
          c2d.lineDashOffset = data[1] || 0
        } else if (method1 === 'textBaseline') {
          if (data[0] === 'normal') {
            data[0] = 'alphabetic'
          }
          // @ts-ignore
          c2d[method1] = data[0]
        } else if (method1 === 'font') {
          // @ts-ignore
          c2d.__font__ = c2d.font = data[0]
        } else {
          // @ts-ignore
          c2d[method1] = data[0]
        }
      } else if (method === 'fillPath' || method === 'strokePath') {
        method = method.replace(/Path/, '')
        c2d.beginPath()
        data.forEach(function (data_) {
          // @ts-ignore
          c2d[data_.method].apply(c2d, data_.data)
        })
        // @ts-ignore
        c2d[method]()
      } else if (method === 'fillText') {
        // @ts-ignore
        c2d.fillText.apply(c2d, data)
      } else if (method === 'drawImage') {
        var A = (function () {
          var dataArray = [...data]
          var url = dataArray[0] as string
          var otherData = dataArray.slice(1)
          _images = _images || {}
          if (
            checkImageLoaded(
              url,
              actions.slice(index + 1),
              callbackId,
              function (image) {
                if (image) {
                  c2d.drawImage.apply(
                    c2d,
                    // @ts-ignore
                    [image].concat(
                      // @ts-ignore
                      [...otherData.slice(4, 8)],
                      [...otherData.slice(0, 4)]
                    )
                  )
                }
              }
            )
          )
            return 'break'
        })()
        if (A === 'break') {
          break
        }
      } else {
        if (method === 'clip') {
          data.forEach(function (data_) {
            // @ts-ignore
            c2d[data_.method].apply(c2d, data_.data)
          })
          c2d.clip()
        } else {
          // @ts-ignore
          c2d[method].apply(c2d, data)
        }
      }
    }
    if (!actionsWaiting.value && callbackId) {
      UniViewJSBridge.publishHandler(
        'onCanvasMethodCallback',
        {
          callbackId,
          data: {
            errMsg: 'drawCanvas:ok',
          },
        },
        getCurrentPageId()
      )
    }
  }
  function preloadImage(actions: Actions) {
    actions.forEach(function (action) {
      var method = action.method
      var data = action.data
      var src = ''
      if (method === 'drawImage') {
        src = data[0] as string
        src = $getRealPath(src)
        data[0] = src
      } else if (method === 'setFillStyle' && data[0] === 'pattern') {
        src = data[1] as string
        src = $getRealPath(src)
        data[1] = src
      }
      if (src && !_images[src]) {
        loadImage()
      }
      /**
       * 加载图像
       */
      function loadImage() {
        // @ts-ignore
        const image = (_images[src] = new Image())
        image.onload = function () {
          // @ts-ignore
          image.ready = true
        }

        // 安卓 WebView 除本地路径无跨域问题
        if (__PLATFORM__ === 'app' && navigator.vendor === 'Google Inc.') {
          if (src.indexOf('file://') === 0) {
            image.crossOrigin = 'anonymous'
          }
          image.src = src
          return
        }
        getSameOriginUrl(src)
          .then((src) => {
            image.src = src
          })
          .catch(() => {
            image.src = src
          })
      }
    })
  }
  function checkImageLoaded(
    src: string,
    actions: Actions,
    callbackId: number,
    fn: (a: CanvasImageSource) => void
  ) {
    var image = _images[src]
    if (image.ready) {
      fn(image)
      return true
    } else {
      _actionsDefer.unshift([actions, true])
      actionsWaiting.value = true
      image.onload = function () {
        image.ready = true
        fn(image)
        actionsWaiting.value = false
        var actions = _actionsDefer.slice(0)
        _actionsDefer = []
        for (var action = actions.shift(); action; ) {
          actionsChanged({
            actions: action[0],
            reserve: action[1],
            callbackId,
          })
          action = actions.shift()
        }
      }
      return false
    }
  }
  function getImageData({
    x = 0,
    y = 0,
    width,
    height,
    destWidth,
    destHeight,
    hidpi = true,
    dataType,
    quality = 1,
    type = 'png',
    callbackId,
  }: {
    x: number
    y: number
    width: number
    height: number
    destWidth: number
    destHeight: number
    hidpi: boolean
    dataType: string
    quality: number
    type: string
    callbackId?: number
  }) {
    const canvas = canvasRef.value!
    let data: string | number[]
    const maxWidth = canvas.offsetWidth - x
    width = width ? Math.min(width, maxWidth) : maxWidth
    const maxHeight = canvas.offsetHeight - y
    height = height ? Math.min(height, maxHeight) : maxHeight
    if (!hidpi) {
      if (!destWidth && !destHeight) {
        destWidth = Math.round(width * pixelRatio)
        destHeight = Math.round(height * pixelRatio)
      } else if (!destWidth) {
        destWidth = Math.round((width / height) * destHeight)
      } else if (!destHeight) {
        destHeight = Math.round((height / width) * destWidth)
      }
    } else {
      destWidth = width
      destHeight = height
    }
    const newCanvas = getTempCanvas(destWidth, destHeight)
    const context = newCanvas.getContext('2d')!
    if (type === 'jpeg' || type === 'jpg') {
      type = 'jpeg'
      context.fillStyle = '#fff'
      context.fillRect(0, 0, destWidth, destHeight)
    }
    // @ts-ignore
    context.__hidpi__ = true
    // @ts-ignore
    context.drawImageByCanvas(
      canvas,
      x,
      y,
      width,
      height,
      0,
      0,
      destWidth,
      destHeight,
      false
    )
    let result
    try {
      let compressed
      if (dataType === 'base64') {
        data = newCanvas.toDataURL(`image/${type}`, quality)
      } else {
        const imgData = context.getImageData(0, 0, destWidth, destHeight)
        if (__PLATFORM__ === 'app') {
          const pako = require('pako') // eslint-disable-line no-restricted-globals
          data = pako.deflateRaw(imgData.data as any, { to: 'string' })
          compressed = true
        } else {
          // fix [...]展开TypedArray在低版本手机报错的问题，使用Array.prototype.slice
          data = Array.prototype.slice.call(imgData.data)
        }
      }
      result = {
        errMsg: 'canvasGetImageData:ok',
        data,
        compressed,
        width: destWidth,
        height: destHeight,
      }
    } catch (error) {
      result = {
        errMsg: `canvasGetImageData:fail ${error}`,
      }
    }
    newCanvas.height = newCanvas.width = 0
    // @ts-ignore
    context.__hidpi__ = false
    if (!callbackId) {
      return result
    } else {
      UniViewJSBridge.publishHandler(
        'onCanvasMethodCallback',
        {
          callbackId,
          data: result,
        },
        getCurrentPageId()
      )
    }
  }
  function putImageData({
    data,
    x,
    y,
    width,
    height,
    compressed,
    callbackId,
  }: {
    data: Array<number>
    x: number
    y: number
    width: number
    height: number
    compressed: boolean
    callbackId: number
  }) {
    try {
      if (!height) {
        height = Math.round(data.length / 4 / width)
      }
      const canvas = getTempCanvas(width, height)
      const context = canvas.getContext('2d')!
      if (__PLATFORM__ === 'app' && compressed) {
        const pako = require('pako') // eslint-disable-line no-restricted-globals
        data = pako.inflateRaw(data) as any
      }
      context.putImageData(
        new ImageData(new Uint8ClampedArray(data), width, height),
        0,
        0
      )
      canvasRef.value!.getContext('2d')!.drawImage(canvas, x, y, width, height)
      canvas.height = canvas.width = 0
    } catch (error) {
      UniViewJSBridge.publishHandler(
        'onCanvasMethodCallback',
        {
          callbackId,
          data: {
            errMsg: 'canvasPutImageData:fail',
          },
        },
        getCurrentPageId()
      )
      return
    }
    UniViewJSBridge.publishHandler(
      'onCanvasMethodCallback',
      {
        callbackId,
        data: {
          errMsg: 'canvasPutImageData:ok',
        },
      },
      getCurrentPageId()
    )
  }
  function toTempFilePath({
    x = 0,
    y = 0,
    width,
    height,
    destWidth,
    destHeight,
    fileType,
    quality,
    dirname,
    callbackId,
  }: {
    x: number
    y: number
    width: number
    height: number
    destWidth: number
    destHeight: number
    fileType: string
    quality: number
    dirname: string
    callbackId: number
  }) {
    const res = getImageData({
      x,
      y,
      width,
      height,
      destWidth,
      destHeight,
      hidpi: false,
      dataType: 'base64',
      type: fileType,
      quality,
    })!
    if (!res.data || !res.data.length) {
      UniViewJSBridge.publishHandler(
        'onCanvasMethodCallback',
        {
          callbackId,
          data: {
            errMsg: res!.errMsg.replace('canvasPutImageData', 'toTempFilePath'),
          },
        },
        getCurrentPageId()
      )
      return
    }
    saveImage(res.data as string, dirname, (error, tempFilePath) => {
      let errMsg = `toTempFilePath:${error ? 'fail' : 'ok'}`
      if (error) {
        errMsg += ` ${error.message}`
      }
      UniViewJSBridge.publishHandler(
        'onCanvasMethodCallback',
        {
          callbackId,
          data: {
            errMsg,
            tempFilePath: tempFilePath,
          },
        },
        getCurrentPageId()
      )
    })
  }

  const methods = {
    actionsChanged,
    getImageData,
    putImageData,
    toTempFilePath,
  }

  function _handleSubscribe(type: keyof typeof methods, data = {}) {
    let method = methods[type]
    if (type.indexOf('_') !== 0 && typeof method === 'function') {
      method(data as any)
    }
  }

  return extend(methods, {
    _resize,
    _handleSubscribe,
  })
}
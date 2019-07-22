// 订阅
class Dep {
  constructor () {
    // 存放所有的watcher
    this.subs = []
  }
  addSub (watcher) {
    this.subs.push(watcher)
  }
  notify () {
    this.subs.forEach(watcher => {
      watcher.update()
    })
  }
}

// 观察者
class Watcher {
  constructor (vm, expr, cb) {
    this.vm = vm
    this.expr = expr
    this.cb = cb
    this.oldValue = this.get()
  }
  get () {
    Dep.target = this
    let val = CompilerUtil.getVal(this.vm, this.expr)
    Dep.target = null
    return val
  }
  update () {// 更新操作 数据变化调用观察者的 update 方法
    let newVal = CompilerUtil.getVal(this.vm, this.expr)
    if (newVal !== this.oldValue) {
      this.cb(newVal)
    }
  }
}

class Observer {// 实现数据劫持
  constructor (data) {
    this.observer(data)
  }

  observer (data) {
    // 如果是对象才观察
    if (data && typeof data === 'object') {
      for (let key in data) {
        this.defineReactive(data, key, data[key])
      }
    }
  }

  defineReactive (obj, key, value) {
    this.observer(value)
    let dep = new Dep() // 给每个属性 都加上一个具有发布订阅的功能
    Object.defineProperty(obj, key, {
      get () {
        Dep.target && dep.addSub(Dep.target)
        return value
      },
      set: (newVal) => {
        if (value !== newVal) {
          this.observer(newVal)
          value = newVal
          dep.notify()
        }
      }
    })
  }
}

class Compiler {
  constructor (el, vm) {
    this.el = this.isElementNode(el) ? el : document.querySelector(el)
    this.vm = vm
    // 把当前节点中的元素 获取到 放到内存中
    let fragment = this.node2fragment(this.el)

    // 把节点中的内容进行替换

    // 编译模版
    this.compiler(fragment)

    // 把内容在塞到页面中
    this.el.appendChild(fragment)
  }

  isDirective (attrName) {
    return attrName.startsWith('v-')
  }

  // 编译元素
  compilerElement (node) {
    let attributes = [...node.attributes]
    attributes.forEach(attr => {
      let { name, value: expr } = attr
      if (this.isDirective(name)) {
        let [, directive] = name.split('-')
        let [directiveName, eventName] = directive.split(':')
        CompilerUtil[directiveName](node, expr, this.vm, eventName)
      }
    })
  }
  // 编译文本
  compilerText (node) {
    let content = node.textContent
    if (/\{\{(.+?)\}\}/.test(content)) {
      CompilerUtil['text'](node, content, this.vm)
    }
  }

  // 编译内存中的dom节点
  compiler (node) {
    let childNodes = [...node.childNodes]
    childNodes.forEach(child => {
      if (this.isElementNode(child)) {
        this.compilerElement(child)
        // 如果是元素，再遍历子节点
        this.compiler(child)
      } else {
        this.compilerText(child)
      }
    })
  }

  node2fragment (node) {
    let fragment = document.createDocumentFragment()
    let firstChild

    while (firstChild = node.firstChild) {
      fragment.appendChild(firstChild)
    }

    return fragment
  }

  isElementNode (node) {
    return node.nodeType === 1
  }
}

CompilerUtil = {
  // 根据表达式获取数据
  getVal (vm, expr) {
    return expr.split('.').reduce((data, current) => {
      return data[current]
    }, vm.$data)
  },
  setVal (vm, expr, value) {
    expr.split('.').reduce((data, current, index, arr) => {
      if (index === arr.length - 1) {
        data[current] = value
      }
      return data[current]
    }, vm.$data)
    console.log(vm.$data)
  },
  model (node, expr, vm) {
    let fn = this.updater['modelUpdater']
    new Watcher(vm, expr, (newVal) => {  // 给输入框加一个观察者
      fn(node, newVal)
    })
    node.addEventListener('input', e => { // 添加时间
      let value = e.target.value
      this.setVal(vm, expr, value)
    })
    let value = this.getVal(vm, expr)
    fn(node, value)
  },
  html (node, expr, vm) {
    let fn = this.updater['htmlUpdater']
    new Watcher(vm, expr, (newVal) => {
      fn(node, newVal)
    })
    let value = this.getVal(vm, expr)
    fn(node, value)
  },
  getContentValue (vm, expr) {
    // 遍历表达式 将内容替换成一个完整的内容 返还回去
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      return this.getVal(vm, args[1])
    })
  },
  on (node, expr, vm, eventName) {
    node.addEventListener(eventName, (e) => {
      vm[expr].call(vm, e)
    })
  },
  text (node, expr, vm) {
    let fn = this.updater['textUpdater']
    let content = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      // 给表达式每 {{}} 加上观察者
      new Watcher(vm, args[1], () => {
        fn(node, this.getContentValue(vm, expr))
      })
      return this.getVal(vm, args[1])
    })
    fn(node, content)
  },
  updater: {
    // 把数据插入到节点中
    modelUpdater (node, value) {
      node.value = value
    },
    htmlUpdater (node, value) {
      node.innerHTML = value
    },
    // 处理文本节点
    textUpdater (node, value) {
      node.textContent = value
    }
  }
}

// 基类 调度
class Vue {
  constructor (options) {
    this.$el = options.el
    this.$data = options.data
    let computed = options.computed
    let methods = options.methods
    if (this.$el) {
      new Observer(this.$data)

      for (let key in computed) { // 有依赖关系
        Object.defineProperty(this.$data, key, {
          get: () => {
            return computed[key].call(this)
          }
        })
      }

      for (let key in methods) {
        Object.defineProperty(this, key, {
          get () {
            return methods[key]
          }
        })
      }

      this.proxyVm(this.$data)

      new Compiler(this.$el, this)
    }
  }
  proxyVm (data) {
    for (let key in data) {
      Object.defineProperty(this, key, {
        get () {
          return data[key]
        },
        set (newVal) {
          data[key] = newVal
        }
      })
    }
  }
}

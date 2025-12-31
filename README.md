# Quartz v4

原仓库文档：
https://quartz.jzhao.xyz/

## 安装说明

### 所需环境

nodejs-v22

### 安装依赖

（如有完整node_modules文件夹，可省略此步）

```bash
npm install
```

### 配置首页

在`/content`文件夹中创建`index.md`作为首页页面。
必须有此页面，否则无法正常运行！
其中内容类似如下：
```
---
title: 首页
description: 这里是描述
---

这里是首页内容
```

### 启动自动构建服务

默认启动在8080端口：
```bash
npx quartz build --serve
```

可使用`--port`参数指定运行端口：
```bash
npx quartz build --serve --port 8765
```

端口监控（而非文件变动监控）：

```bash
npx quartz build --serve --api --port 8181 --wsPort 3002
```

一共会占用2个端口。

选择项目外的文件夹：

```bash
npx quartz build --serve --api --port 8181 --wsPort 3002 -d 'E:\Notes\Obsidian_Notes\content\'
```

npx quartz build --serve --api --port 8181 --wsPort 3002 -d 'E:\Notes\Obsidian_Notes\testwork' --concurrency 4

### 

## 配置说明


### 其他

- YAML中的系统内置键（title、tags），要小写，才能识别！

## PM2进程管理
https://pm2.node.org.cn/docs/usage/restart-strategies/


## 常见问题


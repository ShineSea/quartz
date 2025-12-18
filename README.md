# Quartz v4

> “[One] who works with the door open gets all kinds of interruptions, but [they] also occasionally gets clues as to what the world is and what might be important.” — Richard Hamming

Quartz is a set of tools that helps you publish your [digital garden](https://jzhao.xyz/posts/networked-thought) and notes as a website for free.
Quartz v4 features a from-the-ground rewrite focusing on end-user extensibility and ease-of-use.

🔗 Read the documentation and get started: https://quartz.jzhao.xyz/

[Join the Discord Community](https://discord.gg/cRFFHYye7t)

## 安装说明

环境：
具体不清楚，反正nodejs22可用。

初始化项目：

执行

```bash
npm install
```

然后

```bash
npx quartz build --serve
```

## pm2守护

1、在项目根目录创建`logs`文件夹

```powershell
New-Item -ItemType Directory -Force -Path .\logs
```

2、启动 PM2：
```powershell
pm2 start ecosystem.config.cjs
```

3、查看状态：
```powershell
pm2 status
pm2 logs my-quartz
```

4、停止/重启：
```powershell
pm2 stop my-quartz
pm2 restart my-quartz
```
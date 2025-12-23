# Quartz v4

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
npx quartz build --serve --port 8765
```
## 配置说明

- YAML中的系统内置键（title、tags），要小写，才能识别！



## pm2守护（没调试好，暂不启用）

> 原项目里面有三个服务。如果添加进程守护的话，需要修改原有的服务启动关闭逻辑的源码。之后再看。

https://pm2.node.org.cn/docs/usage/quick-start/

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
```



4、停止/重启：
```powershell
pm2 stop my-quartz
pm2 restart my-quartz
```

### PM2日志

https://pm2.node.org.cn/docs/usage/log-management/

查看日志：
```
pm2 logs my-quartz
```

#### PM2日志轮转管理

https://github.com/keymetrics/pm2-logrotate#configure

安装：
```
pm2 install pm2-logrotate
```

日志轮转配置文件在 `C:\Users\你的用户名\.pm2\module_conf.json`。


基础设置：
```
pm2 set pm2-logrotate:max_size 60M;
pm2 set pm2-logrotate:retain 30;
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD;
pm2 set pm2-logrotate:rotateInterval '0 0 * * *';
pm2 set pm2-logrotate:compress true;
pm2 set pm2-logrotate:workerInterval 60;
```

验证配置：

```bash
pm2 conf
```

查看单个配置：

```bash
pm2 get pm2-logrotate:max_size
pm2 get pm2-logrotate:retain
```

### PM2 命令清单

查看配置

```owershell
pm2 conf  # 查看 pm2-logrotate 配置
```

查看日志

```powershell
# 实时查看日志（带时间戳）
pm2 logs my-quartz

# 查看最近 50 行
pm2 logs my-quartz --lines 50

# 不实时滚动，只看一次
pm2 logs my-quartz --lines 20 --nostream

# 只看错误日志
pm2 logs my-quartz --err

# 只看标准输出
pm2 logs my-quartz --out
```

管理服务

```powershell
# 查看状态（包括内存使用）
pm2 status

# 实时监控（CPU + 内存）
pm2 monit

# 重启服务
pm2 restart my-quartz

# 停止服务
pm2 stop my-quartz

# 清空日志
pm2 flush my-quartz
```

日志轮转管理

```powershell
# 手动触发日志轮转
pm2 trigger pm2-logrotate rotate

# 修改配置（示例）
pm2 set pm2-logrotate:max_size 100M  # 改为 100MB
pm2 set pm2-logrotate:retain 60      # 保留 60 个文件
```
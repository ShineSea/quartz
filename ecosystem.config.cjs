module.exports = {
  apps: [{
    name: "my-quartz",
    script: "./quartz/bootstrap-cli.mjs",
    args: "build --serve --port 8765",
    interpreter: "node",
    interpreter_args: "--no-deprecation",
    // 与 bootstrap-cli.mjs 第一行的 shebang #!/usr/bin/env -S node --no-deprecation 保持一致
    cwd: "./",
    watch: false,  // Quartz 自带文件监听，不需要 PM2 的 watch
    env: {
      NODE_ENV: "production",
    },

    // 日志配置
    error_file: "./logs/quartz-error.log",
    out_file: "./logs/quartz-out.log",
    log_file: "./logs/quartz-combined.log",  // 合并日志
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",  // 日志时间戳格式（精确到毫秒）
    time: true,  // 启用时间戳前缀
    
    // 进程管理配置
    max_restarts: 10,  // 最多重启 10 次
    min_uptime: "10s",  // 确保进程稳定运行 10 秒后才算成功启动
    restart_delay: 4000,  // 自动重启延迟 4 秒，防止频繁重启
    autorestart: true,  // 启用自动重启
    
    // 内存管理
    max_memory_restart: "1000M",  // 内存超过 1000MB 时自动重启（防止内存泄漏）
    
    // 优雅关闭
    kill_timeout: 5000,  // 发送 SIGINT 信号，等待 5 秒，超时则强制杀死
    
    // 实例配置
    instances: 1,  // 单实例运行
    exec_mode: "fork",  // fork 模式（非 cluster 模式）
  }]
}
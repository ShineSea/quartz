module.exports = {
  apps: [{
    name: "my-quartz",
    script: "./quartz/bootstrap-cli.mjs",
    args: "build --serve",
    interpreter: "node",
    interpreter_args: "--no-deprecation",
    // 与 bootstrap-cli.mjs 第一行的 shebang #!/usr/bin/env -S node --no-deprecation 保持一致
    cwd: "./",
    watch: false,  // Quartz 自带文件监听，不需要 PM2 的 watch
    env: {
      NODE_ENV: "production",
    },
    error_file: "./logs/quartz-error.log",
    out_file: "./logs/quartz-out.log",
    merge_logs: true,
    // 如果进程崩溃，最多重启 10 次
    max_restarts: 10,
    // 确保进程稳定运行 10 秒后才算成功启动
    min_uptime: "10s",
    // 优雅关闭：发送 SIGINT 信号，等待超时时间，强制杀死（如果超时）
    kill_timeout: 5000,
  }]
}
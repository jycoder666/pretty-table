#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pretty-table 启动脚本 start.bat 的中文提示文案表。

约定（见技能 F:/docs/skills/windows-chinese-bat/SKILL.md，B 类工程型三件套）:
- 本文件源码为 UTF-8；控制台编码由 start.bat 里的 PYTHONIOENCODING=gbk 决定。
- 不要对 sys.stdout 做 reconfigure，会与环境变量冲突导致 GBK 控制台乱码。
- start.bat 保持纯 ASCII，所有中文文案集中在这里；bat 只传 ASCII 消息码，
  禁止 bat 向本脚本传中文参数。

三件套说明:
- start.content.txt 是唯一可编辑逻辑稿，改稿后必须重新生成 start.bat:
  python F:/docs/skills/windows-chinese-bat/scripts/write_bat_gbk.py F:/pretty-table/start.bat F:/pretty-table/start.content.txt
- 重新生成后跑校验:
  python F:/docs/skills/windows-chinese-bat/scripts/verify_bat.py F:/pretty-table/start.bat --source F:/pretty-table/start.content.txt --strict --smoke-args check --expect-exit 0
- 用法: start.bat 无参进交互菜单 | start.bat check 只读自检 | start.bat 1 启动 dev 端口 5173
- 环境变量: NO_BROWSER=1 时不自动打开浏览器；端口被占用时询问是否结束占用进程（回车默认结束），
  PT_KILL=1 免询问直接清理；check 自检永远只读不杀。

用法: python bat_msg.py <消息码> [端口]
"""

from __future__ import annotations

import shutil
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEV_PORT = 5173


def say(*lines: str) -> None:
    for line in lines:
        print(line, flush=True)


def port_busy(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def selfcheck() -> int:
    pkg = (ROOT / "package.json").is_file()
    modules = (ROOT / "node_modules").is_dir()
    msg = (ROOT / "bat_msg.py").is_file()
    pnpm = shutil.which("pnpm") or ""
    node = shutil.which("node") or ""

    ver = "未找到"
    if node:
        try:
            done = subprocess.run(
                [node, "-v"], capture_output=True, text=True, timeout=5
            )
            ver = (done.stdout or done.stderr).strip() or "未知"
        except Exception as exc:
            ver = f"读取失败, {exc}"

    say(
        "",
        " ============================================",
        "   pretty-table - 环境自检",
        " ============================================",
        f"   项目目录     : {ROOT}",
        f"   package.json : {'存在' if pkg else '缺失'}",
        f"   node_modules : {'已安装' if modules else '未安装, 菜单 1 会自动 pnpm install'}",
        f"   bat_msg.py   : {'存在' if msg else '缺失'}",
        f"   node         : {ver}",
        f"   pnpm         : {pnpm or '未找到, 请先 npm install -g pnpm'}",
        f"   开发端口 5173: {'占用中' if port_busy(DEV_PORT) else '空闲'}",
        " --------------------------------------------",
        "   说明: 端口被占用时脚本只提示, 不会结束占用进程",
    )
    ok = pkg and msg and bool(pnpm)
    say(
        "   自检结果     : "
        + ("通过, 可以启动开发服务" if ok else "未通过, 请先修复上面的缺失项"),
        " ============================================",
        "",
    )
    return 0 if ok else 1



def listeners_of(port: str) -> list[int]:
    """监听指定端口的 PID 去重列表（IPv4/IPv6 都算；解析 netstat -ano）。"""
    pids: list[int] = []
    r = subprocess.run(["netstat", "-ano"], capture_output=True, text=True)
    tag = f":{port} "
    for line in (r.stdout or "").splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[3].upper() == "LISTENING" and tag in parts[1] + " ":
            try:
                pid = int(parts[4])
            except ValueError:
                continue
            if pid not in pids:
                pids.append(pid)
    return pids


def name_of(pid: int) -> str:
    """PID 的进程名（查不到返回占位）。"""
    r = subprocess.run(
        ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
        capture_output=True, text=True,
    )
    line = (r.stdout or "").strip().splitlines()[0] if (r.stdout or "").strip() else ""
    if line.startswith('"'):
        return line.split('","')[0].strip('"')
    return "未知进程"


def main() -> int:
    if len(sys.argv) < 2:
        return 0
    cmd = sys.argv[1]
    port = sys.argv[2] if len(sys.argv) > 2 else ""

    if cmd == "menu":
        say(
            "",
            " ============================================",
            "   pretty-table - 启动菜单",
            " ============================================",
            "   1  启动开发服务   pnpm dev, 端口 5173",
             "   （端口被占用时会询问, 回车即清理后重启）",
            "   2  环境自检       只读检查, 不启动服务",
            "   0  退出",
            " --------------------------------------------",
            "   菜单 1 自动安装缺失依赖并打开浏览器",
            "   保持窗口打开即保持服务, Ctrl+C 停止",
            " ============================================",
        )
        print("   请输入选项后回车: ", end="", flush=True)

    elif cmd == "selfcheck":
        return selfcheck()

    elif cmd == "dev-banner":
        say(
            "",
            " ============================================",
            "   正在启动开发服务器",
            " ============================================",
            f"   地址: http://127.0.0.1:{port}/",
            "   保持本窗口打开, 关闭或 Ctrl+C 即停止服务",
            " ============================================",
            "",
        )

    elif cmd == "info-pnpm-install":
        say("[信息] 未检测到 node_modules, 首次运行自动安装依赖 ...")
    elif cmd == "err-no-package":
        say("[错误] 当前目录没有 package.json, 请在项目目录下运行")
    elif cmd == "err-no-pnpm":
        say("[错误] 未找到 pnpm, 请先安装: npm install -g pnpm")
    elif cmd == "err-bad-choice":
        say("[提示] 无效选项, 请输入 0-2")
    elif cmd == "port-free":
        # 只读：报告端口占用情况。空闲 return 0；被占 return 1（不杀）。
        pids = listeners_of(port)
        if not pids:
            return 0
        rows = [f"PID {pid} ({name_of(pid)})" for pid in pids]
        say(f"[提示] 端口 {port} 已被占用: " + "、".join(rows))
        say("       若正是本项目的旧服务, 可结束它后重启")
        return 1

    elif cmd == "port-kill":
        # 清理：结束占用端口的进程树并复测。成功释放 return 0，否则 return 1。
        killed = False
        for pid in listeners_of(port):
            if pid in (0, 4):
                say(f"[跳过] PID {pid} 是系统进程, 不结束")
                continue
            name = name_of(pid)
            r = subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True, text=True,
            )
            if r.returncode == 0:
                say(f"[执行] 已结束占用进程 PID {pid} ({name})")
                killed = True
            else:
                say(f"[错误] 结束 PID {pid} ({name}) 失败: {(r.stderr or r.stdout).strip()[:80]}")
        if not killed:
            say("[错误] 端口仍被占用, 无法自动清理")
            return 1
        if listeners_of(port):
            say("[错误] 进程已结束但端口仍未释放, 请稍候重试或手动处理")
            return 1
        say(f"[成功] 端口 {port} 已释放, 继续启动")
        return 0

    elif cmd == "port-kill-ask":
        print(f"端口 {port} 被占用。结束占用进程并重启? [Y/n] ", end="", flush=True)

    elif cmd == "port-kill-declined":
        say("[提示] 已保留占用进程, 本次不启动。关闭占用方或换端口后重试")

    elif cmd == "err-port-busy":
        say(
            f"[提示] 端口 {port} 已被占用",
            "       若服务已在运行, 可直接用浏览器访问, 或关闭旧窗口后重试",
            "       本脚本不会自动结束占用端口的进程",
        )
    elif cmd == "err-pnpm-install":
        say("[错误] pnpm install 失败, 请检查上方报错和网络")
    elif cmd == "err-dev-failed":
        say("[错误] 开发服务器启动失败, 请检查上方报错")
    elif cmd == "press-any-key":
        print("按任意键返回菜单 ...", end="", flush=True)
    else:
        say(f"[错误] 未知消息命令: {cmd}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

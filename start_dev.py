import os
import subprocess
import time
import sys
import psutil
from threading import Thread

def kill_process_on_port(port):
    for conn in psutil.net_connections():
        if conn.laddr.port == port:
            try:
                proc = psutil.Process(conn.pid)
                proc.terminate()
                proc.wait(timeout=3)
                print(f"[CLEANUP] Killed process {proc.pid} on port {port}")
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired):
                pass

def read_stream(stream, prefix):
    for line in iter(stream.readline, ''):
        if line:
            print(f"{prefix} {line.strip()}")
            sys.stdout.flush()

if __name__ == "__main__":
    print("=======================================")
    print("   Genshin Pick System - Dev Runner")
    print("=======================================")
    print("\n[1/3] Checking for zombies...")
    kill_process_on_port(8000)
    kill_process_on_port(5173)
    time.sleep(1)
    
    # Path setup
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")
    venv_python = os.path.join(root_dir, "venv", "Scripts", "python.exe")
    alembic_exe = os.path.join(root_dir, "venv", "Scripts", "alembic.exe")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    print("\n[2/3] Running DB Migrations...")
    subprocess.run([alembic_exe, "upgrade", "head"], cwd=backend_dir, check=True)

    print("\n[3/3] Starting Servers...\n")
    
    # Start backend
    backend_proc = subprocess.Popen(
        [venv_python, "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
        cwd=backend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    # Start frontend
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=frontend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    # Output readers
    Thread(target=read_stream, args=(backend_proc.stdout, "\033[94m[BACKEND]\033[0m"), daemon=True).start()
    Thread(target=read_stream, args=(frontend_proc.stdout, "\033[92m[FRONTEND]\033[0m"), daemon=True).start()

    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Stopping servers...")
        backend_proc.terminate()
        frontend_proc.terminate()
        sys.exit(0)

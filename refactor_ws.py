import os

handlers_path = os.path.join("backend", "app", "websockets", "handlers.py")

with open(handlers_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

out_lines = []
in_main_loop = False
in_try = False

for i, line in enumerate(lines):
    if "# ── Step 6: Main message loop ─────────────────────────────────────────" in line:
        out_lines.append(line)
        continue

    if "while True:" in line and "data = await ws.receive_json()" in lines[i+1]:
        out_lines.append(line)
        out_lines.append(lines[i+1]) # data = await ws.receive_json()
        out_lines.append("            try:\n")
        in_main_loop = True
        continue
        
    if in_main_loop and "data = await ws.receive_json()" in line:
        continue # Already added
        
    if in_main_loop and "except WebSocketDisconnect:" in line:
        # Add the except block for the inner try
        out_lines.append("            except Exception as e:\n")
        out_lines.append("                import traceback\n")
        out_lines.append("                traceback.print_exc()\n")
        out_lines.append("                await _err(ws, f\"Handler error: {e}\")\n\n")
        in_main_loop = False
        out_lines.append(line)
        continue
        
    if in_main_loop:
        if line.strip() == "":
            out_lines.append("\n")
        else:
            out_lines.append("    " + line)
    else:
        out_lines.append(line)

with open(handlers_path, "w", encoding="utf-8") as f:
    f.writelines(out_lines)
    
print("Handlers updated.")

from pathlib import Path
path = Path(r'C:\Users\pc\Desktop\Proyecto_Taller_mecanico\Taller mecanico\src\app\pages\mechanic-dashboard\mechanic-dashboard.component.html')
text = path.read_text(encoding='utf-8')
marker = 'Repuestos y costos'
idx = text.index(marker)
print(repr(text[max(0, idx-200):idx+700]))

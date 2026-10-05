from pathlib import Path

path = Path(r'C:\Users\pc\Desktop\Proyecto_Taller_mecanico\Taller mecanico\src\app\pages\mechanic-dashboard\mechanic-dashboard.component.ts')
text = path.read_text(encoding='utf-8')
markers = ["additionalMessage = ''", 'get clients()', 'saveMechanicData(): void {']
for marker in markers:
    idx = text.find(marker)
    print('MARKER', marker, 'IDX', idx)
    if idx != -1:
        print(repr(text[max(0, idx-200):idx+500]))
        print('---')

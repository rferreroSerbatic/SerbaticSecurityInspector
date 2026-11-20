import type { Vuln } from '../types'

export const OWASP_VULNS: Vuln[] = [
  {
    id: 'A01',
    name: 'Fallos de control de acceso',
    icon: '🔓',
    description: 'Permite actuar sin permisos o acceder a recursos de otros usuarios.',
  },
  {
    id: 'A02',
    name: 'Fallos criptográficos',
    icon: '🔑',
    description: 'Datos sensibles que viajan o se almacenan sin protección adecuada.',
  },
  {
    id: 'A03',
    name: 'Inyección',
    icon: '💉',
    description: 'Entradas no validadas se ejecutan como código o consulta inesperada.',
  },
  {
    id: 'A04',
    name: 'Diseño inseguro',
    icon: '🧩',
    description: 'La aplicación se construyó sin los principios básicos de seguridad.',
  },
  {
    id: 'A05',
    name: 'Configuración insegura',
    icon: '⚙️',
    description: 'Valores por defecto o configuraciones incompletas que exponen la app.',
  },
  {
    id: 'A06',
    name: 'Componentes vulnerables u obsoletos',
    icon: '📦',
    description: 'Dependencias con vulnerabilidades conocidas o sin mantenimiento.',
  },
  {
    id: 'A07',
    name: 'Identificación y autenticación',
    icon: '🔐',
    description: 'Fallos en credenciales, sesiones o recuperación de contraseñas.',
  },
  {
    id: 'A08',
    name: 'Integridad del software',
    icon: '📜',
    description: 'Procesos de build o despliegue que permiten binarios falsificados.',
  },
  {
    id: 'A09',
    name: 'Registro y monitorización',
    icon: '📡',
    description: 'Sin registros ni alertas, los incidentes pasan desapercibidos.',
  },
  {
    id: 'A10',
    name: 'Suplantición de servidor (SSRF)',
    icon: '🌐',
    description: 'La aplicación hace peticiones a URLs controladas por el atacante.',
  },
]

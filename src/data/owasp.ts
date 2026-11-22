import type { Vuln } from '../types'

// CVEs representativos de cada categoría (QA-iter 6): un CVE real y conocido
// que ejemplifica la clase de vulnerabilidad, con su ficha en cve.org.
// Verificado contra la API oficial del CVE (cveawg.mitre.org) el 2026-11-22;
// el mapeo de backend (pdf_report.VULN_CVES) es idéntico byte a byte.
export const OWASP_VULNS: Vuln[] = [
  {
    id: 'A01',
    name: 'Fallos de control de acceso',
    icon: '🔓',
    description: 'Permite actuar sin permisos o acceder a recursos de otros usuarios.',
    cve: 'CVE-2024-38816', // Spring Framework: path traversal (lectura de cualquier archivo)
  },
  {
    id: 'A02',
    name: 'Fallos criptográficos',
    icon: '🔑',
    description: 'Datos sensibles que viajan o se almacenan sin protección adecuada.',
    cve: 'CVE-2014-0160', // OpenSSL: Heartbleed
  },
  {
    id: 'A03',
    name: 'Inyección',
    icon: '💉',
    description: 'Entradas no validadas se ejecutan como código o consulta inesperada.',
    cve: 'CVE-2021-44228', // Log4Shell (Apache Log4j2, JNDI)
  },
  {
    id: 'A04',
    name: 'Diseño inseguro',
    icon: '🧩',
    description: 'La aplicación se construyó sin los principios básicos de seguridad.',
    cve: 'CVE-2020-1472', // Zerologon (defecto de diseño en MS-NRPC)
  },
  {
    id: 'A05',
    name: 'Configuración insegura',
    icon: '⚙️',
    description: 'Valores por defecto o configuraciones incompletas que exponen la app.',
    cve: 'CVE-2020-1938', // Apache Tomcat AJP («Ghostcat»: confianza insegura por defecto)
  },
  {
    id: 'A06',
    name: 'Componentes vulnerables u obsoletos',
    icon: '📦',
    description: 'Dependencias con vulnerabilidades conocidas o sin mantenimiento.',
    cve: 'CVE-2021-45046', // Apache Log4j 2.15.0: fix incompleto (componente vulnerable)
  },
  {
    id: 'A07',
    name: 'Identificación y autenticación',
    icon: '🔐',
    description: 'Fallos en credenciales, sesiones o recuperación de contraseñas.',
    cve: 'CVE-2019-11510', // Pulse Secure: lectura de archivo sin autenticación
  },
  {
    id: 'A08',
    name: 'Integridad del software',
    icon: '📜',
    description: 'Procesos de build o despliegue que permiten binarios falsificados.',
    cve: 'CVE-2024-3094', // XZ Utils: backdoor en la cadena de suministro
  },
  {
    id: 'A09',
    name: 'Registro y monitorización',
    icon: '📡',
    description: 'Sin registros ni alertas, los incidentes pasan desapercibidos.',
    cve: 'CVE-2019-8123', // Magento: insuficiente registro y monitorización
  },
  {
    id: 'A10',
    name: 'Suplantición de servidor (SSRF)',
    icon: '🌐',
    description: 'La aplicación hace peticiones a URLs controladas por el atacante.',
    cve: 'CVE-2023-44256', // Fortinet FortiAnalyzer/FortiManager: SSRF (CWE-918)
  },
]

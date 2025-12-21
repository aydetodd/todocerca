import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const Privacidad = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground p-4">
        <div className="container mx-auto flex items-center gap-4">
          <Link to="/" className="hover:opacity-80">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-xl font-bold">Política de Privacidad</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="prose prose-sm sm:prose lg:prose-lg dark:prose-invert">
          <h1 className="text-2xl font-bold text-foreground mb-6">Política de Privacidad de TodoCerca</h1>
          
          <p className="text-muted-foreground mb-4">
            <strong>Última actualización:</strong> 20 de diciembre de 2024
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Información que Recopilamos</h2>
            <p className="text-muted-foreground mb-2">TodoCerca recopila la siguiente información:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Información de cuenta:</strong> Nombre, correo electrónico y número de teléfono.</li>
              <li><strong>Ubicación:</strong> Con tu permiso, recopilamos datos de ubicación en tiempo real para mostrar proveedores cercanos y permitir el seguimiento GPS.</li>
              <li><strong>Datos de uso:</strong> Información sobre cómo utilizas la aplicación.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Uso de la Información</h2>
            <p className="text-muted-foreground mb-2">Utilizamos tu información para:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Proporcionar y mantener nuestros servicios.</li>
              <li>Mostrar proveedores y productos cercanos a tu ubicación.</li>
              <li>Permitir el seguimiento de ubicación en grupos familiares (con tu consentimiento).</li>
              <li>Enviar notificaciones relevantes sobre pedidos y servicios.</li>
              <li>Mejorar la experiencia del usuario.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Permisos de Ubicación</h2>
            <p className="text-muted-foreground mb-2">
              TodoCerca solicita acceso a tu ubicación para las siguientes funciones:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Ubicación en primer plano:</strong> Para mostrar proveedores cercanos.</li>
              <li><strong>Ubicación en segundo plano:</strong> Para el seguimiento GPS familiar (solo si activas esta función).</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Puedes revocar estos permisos en cualquier momento desde la configuración de tu dispositivo.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Compartir Información</h2>
            <p className="text-muted-foreground mb-2">
              No vendemos ni compartimos tu información personal con terceros, excepto:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Con miembros de tu grupo de seguimiento (solo ubicación, con tu consentimiento).</li>
              <li>Con proveedores cuando realizas un pedido (solo información necesaria para la entrega).</li>
              <li>Cuando sea requerido por ley.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Seguridad de los Datos</h2>
            <p className="text-muted-foreground">
              Implementamos medidas de seguridad técnicas y organizativas para proteger tu información personal contra acceso no autorizado, pérdida o alteración.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Retención de Datos</h2>
            <p className="text-muted-foreground">
              Conservamos tu información mientras mantengas una cuenta activa. Puedes solicitar la eliminación de tu cuenta y datos en cualquier momento contactándonos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Tus Derechos</h2>
            <p className="text-muted-foreground mb-2">Tienes derecho a:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Acceder a tu información personal.</li>
              <li>Corregir datos inexactos.</li>
              <li>Solicitar la eliminación de tus datos.</li>
              <li>Revocar permisos de ubicación.</li>
            </ul>
          </section>

          <section className="mb-8" id="seguridad-infantil">
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Estándares de Seguridad Infantil</h2>
            <p className="text-muted-foreground mb-4">
              TodoCerca está comprometido con la seguridad de todos los usuarios, especialmente los menores de edad. Implementamos las siguientes medidas para prevenir la explotación y abuso de menores:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Prohibición de contenido dañino:</strong> Prohibimos estrictamente cualquier contenido que involucre, promueva o facilite la explotación o abuso sexual de menores (CSAM).</li>
              <li><strong>Monitoreo y reporte:</strong> Cualquier contenido o comportamiento sospechoso será reportado a las autoridades competentes.</li>
              <li><strong>Función de seguimiento familiar:</strong> Nuestra función de rastreo GPS está diseñada para que los padres puedan monitorear la ubicación de sus hijos de manera segura, requiriendo consentimiento mutuo para unirse a grupos.</li>
              <li><strong>Sin interacción directa entre desconocidos:</strong> Los mensajes solo pueden enviarse entre usuarios que han establecido una relación comercial (cliente-proveedor) o familiar (grupos de rastreo con invitación).</li>
              <li><strong>Eliminación inmediata:</strong> Eliminaremos inmediatamente cualquier cuenta o contenido que viole estas políticas.</li>
              <li><strong>Cumplimiento legal:</strong> Cumplimos con todas las leyes de seguridad infantil aplicables en México y reportamos a las autoridades pertinentes (SIPINNA, DIF, Fiscalía) cuando es necesario.</li>
            </ul>
          </section>

          <section className="mb-8" id="reportar">
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Reportar Contenido o Comportamiento Inapropiado</h2>
            <p className="text-muted-foreground mb-4">
              TodoCerca permite reportar cualquier problema de seguridad de forma <strong>anónima</strong>. Si detectas contenido inapropiado, comportamiento sospechoso, o cualquier situación que ponga en riesgo a menores:
            </p>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
              <p className="text-foreground font-semibold mb-2">Canales de Reporte:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>
                  <strong>Email de reporte:</strong>{" "}
                  <a href="mailto:reportes@todocerca.app?subject=Reporte%20de%20Seguridad" className="text-primary underline">
                    reportes@todocerca.app
                  </a>
                </li>
                <li>
                  <strong>Email alternativo:</strong>{" "}
                  <a href="mailto:construcabanasdemexico@gmail.com?subject=Reporte%20de%20Seguridad%20Anonimo" className="text-primary underline">
                    construcabanasdemexico@gmail.com
                  </a>
                </li>
              </ul>
            </div>
            <p className="text-muted-foreground mb-2">
              <strong>Tu reporte puede ser completamente anónimo.</strong> No necesitas proporcionar tu nombre o información personal. Incluye en tu reporte:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Descripción del problema o comportamiento observado</li>
              <li>Nombre de usuario o negocio involucrado (si lo conoces)</li>
              <li>Capturas de pantalla (opcional)</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Todos los reportes son revisados en un plazo máximo de 24 horas y se toman acciones inmediatas cuando es necesario, incluyendo la notificación a las autoridades competentes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Cambios a esta Política</h2>
            <p className="text-muted-foreground">
              Podemos actualizar esta política ocasionalmente. Te notificaremos sobre cambios significativos a través de la aplicación.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Contacto</h2>
            <p className="text-muted-foreground">
              Si tienes preguntas sobre esta política de privacidad o seguridad infantil, contáctanos en: <a href="mailto:construcabanasdemexico@gmail.com" className="text-primary underline">construcabanasdemexico@gmail.com</a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Privacidad;

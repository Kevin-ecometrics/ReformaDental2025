import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { FaArrowLeft, FaArrowRight, FaCheckCircle } from "react-icons/fa";

function Treatments() {
  const isSpanish = window.location.pathname === "/es/";

  const translations = {
    en: {
      title: "Our Most Popular Treatments",
      subtitle: "From cleanings to complex procedures — we handle it all.",
      cta: "Book Your Appointment",
      treatmentLabel: "Treatment",
      of: "of",
      viewAll: "View All Treatments",
      backToCarousel: "Back to Carousel",
      treatments: [
        {
          name: "Root Canal",
          image: "/images/endodoncia.webp",
          price: "$250 - $300",
          description:
            "Clean and seal infected root canals to preserve your natural teeth.",
          benefits: ["Pain relief", "Tooth preservation", "Quick recovery"],
        },
        {
          name: "Braces / Orthodontics",
          image: "/images/ortodoncia.webp",
          price: "From $500 - $750",
          description:
            "Choose between autoligado or convencional. Both straighten teeth effectively.",
          benefits: [
            "Autoligado (Pitts 21): $750 initial, $80/month",
            "Conventional: $500 initial, $50/month",
            "Treatment time may vary",
          ],
        },
        {
          name: "Implants",
          image: "/images/implantes.webp",
          price: "$1650",
          description:
            "Permanent, natural-looking replacements for missing teeth.",
          benefits: ["Durable", "Aesthetic", "Functional"],
        },
        {
          name: "Extraction",
          image: "/images/extracion.webp",
          price: "$150 (simple) - $200 (surgical)",
          description:
            "Safe and efficient removal of problematic or decayed teeth. Surgical options available.",
          benefits: ["Relieves pain", "Prevents infection", "Quick procedure"],
        },
        {
          name: "Crowns",
          image: "/images/corona.webp",
          price: "$380 - $480",
          description:
            "Options available: Metal-porcelain ($380) or Zirconia ($480). Both restore damaged teeth.",
          benefits: ["Strong", "Natural look", "Tooth preservation"],
        },
        {
          name: "Fillings",
          image: "/images/recina.webp",
          price: "$50 - $80",
          description:
            "Restore the function and integrity of teeth with high-quality resin fillings.",
          benefits: ["Fast treatment", "Affordable", "Tooth-saving"],
        },
        {
          name: "Periodontics",
          image: "/images/perio.webp",
          price: "$400",
          description: "Treat gum disease and keep your mouth healthy.",
          benefits: ["Healthier gums", "Stops bleeding", "Fresh breath"],
        },
        {
          name: "Dentures / Prosthodontics",
          image: "/images/dentadura.webp",
          price: "$700",
          description:
            "Custom-fit dentures for a complete and functional smile.",
          benefits: ["Removable", "Comfortable", "Affordable"],
        },
        {
          name: "General Treatments",
          image: "/images/tratamiento.webp",
          price: "$50",
          description:
            "Routine treatments like cleanings and checkups to keep you healthy.",
          benefits: ["Preventive", "Essential", "Affordable"],
        },
      ],
    },

    es: {
      title: "Nuestros Tratamientos Más Populares",
      subtitle:
        "Desde limpiezas hasta procedimientos complejos — lo manejamos todo.",
      cta: "Agenda tu cita",
      treatmentLabel: "Tratamiento",
      of: "de",
      viewAll: "Ver todos los tratamientos",
      backToCarousel: "Volver al carrusel",
      treatments: [
        {
          name: "Endodoncia",
          image: "/images/endodoncia.webp",
          price: "$250 - $300",
          description:
            "Limpia y sella los conductos infectados para preservar tus dientes naturales.",
          benefits: [
            "Alivio del dolor",
            "Preservación dental",
            "Recuperación rápida",
          ],
        },
        {
          name: "Ortodoncia / Brackets",
          image: "/images/ortodoncia.webp",
          price: "Desde $500 - $750",
          description:
            "Elige entre brackets autoligado o convencional. Ambos alinean tus dientes eficazmente.",
          benefits: [
            "Autoligado (Pitts 21): Pago inicial $750, mensualidad $80",
            "Convencional: Pago inicial $500, mensualidad $50",
            "El tiempo puede variar",
          ],
        },
        {
          name: "Implantes Dentales",
          image: "/images/implantes.webp",
          price: "$1650",
          description: "Reemplazo permanente y natural para dientes perdidos.",
          benefits: ["Duraderos", "Estéticos", "Funcionales"],
        },
        {
          name: "Extracción",
          image: "/images/extracion.webp",
          price: "$150 (simple) - $200 (quirúrgica)",
          description:
            "Extracción segura y eficiente de dientes problemáticos. Opción quirúrgica disponible.",
          benefits: ["Alivio del dolor", "Prevención de infecciones", "Rápido"],
        },
        {
          name: "Coronas",
          image: "/images/corona.webp",
          price: "$380 - $480",
          description:
            "Opciones: Metal-porcelana ($380) o Zirconia ($480). Ambas restauran los dientes dañados.",
          benefits: ["Resistentes", "Apariencia natural", "Preservan dientes"],
        },
        {
          name: "Resinas / Rellenos",
          image: "/images/recina.webp",
          price: "$50 - $80",
          description: "Restaura dientes con materiales de resina duraderos.",
          benefits: ["Rápido", "Accesible", "Salvaguarda dental"],
        },
        {
          name: "Periodoncia",
          image: "/images/perio.webp",
          price: "$400",
          description: "Tratamiento para enfermedades de las encías.",
          benefits: ["Encías saludables", "Menos sangrado", "Aliento fresco"],
        },
        {
          name: "Prótesis / Dentaduras",
          image: "/images/dentadura.webp",
          price: "$700",
          description:
            "Dentaduras a medida para una sonrisa funcional y completa.",
          benefits: ["Removibles", "Cómodas", "Accesibles"],
        },
        {
          name: "Tratamientos Generales",
          image: "/images/tratamiento.webp",
          price: "$50",
          description:
            "Limpiezas y chequeos de rutina para mantener tu salud bucal.",
          benefits: ["Preventivos", "Esenciales", "Accesibles"],
        },
      ],
    },
  };
  const t = isSpanish ? translations.es : translations.en;
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const treatment = t.treatments[index];

  const controls = useAnimation();
  const autoplayRef = useRef();
  const containerRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);

  // Funciones de navegación con wrap-around
  const next = () => setIndex((prev) => (prev + 1) % t.treatments.length);
  const prev = () =>
    setIndex((prev) => (prev - 1 + t.treatments.length) % t.treatments.length);

  // Autoplay con pausa on hover
  useEffect(() => {
    if (showAll) return;
    if (isHovering) return;

    autoplayRef.current = setInterval(() => {
      next();
    }, 5000);

    return () => clearInterval(autoplayRef.current);
  }, [index, showAll, isHovering]);

  // Keyboard navigation
  useEffect(() => {
    if (showAll) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAll]);

  // Función para manejar el drag end y detectar swipe
  const handleDragEnd = (event, info) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    // Umbral para swipe
    if (offset < -100 || velocity < -500) {
      next();
    } else if (offset > 100 || velocity > 500) {
      prev();
    } else {
      // Regresa al centro si no se superó el umbral
      controls.start({
        x: 0,
        transition: { type: "spring", stiffness: 300, damping: 30 },
      });
    }
  };

  // Barra de progreso del carrusel
  const progressPercent = ((index + 1) / t.treatments.length) * 100;

  return (
    <section className="bg-[#F5FFE5] py-12 scroll-mt-12" id="Treatments">
      <div className="mx-auto max-w-screen-lg px-4">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-[#222]">
            {t.title}
          </h1>
          <p className="text-gray-600 mt-2">{t.subtitle}</p>
        </div>

        {!showAll ? (
          // Carousel con drag de framer-motion
          <div
            className="bg-white rounded-2xl shadow-lg p-6 md:p-10 relative overflow-hidden"
            ref={containerRef}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            role="region"
            aria-label="Treatment carousel"
          >
            {/* Barra de progreso */}
            <div
              className="absolute top-0 left-0 h-1 bg-[#9DC216] transition-all"
              style={{ width: `${progressPercent}%` }}
            />

            <AnimatePresence mode="wait">
              <motion.div
                key={treatment.name}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                onDragEnd={handleDragEnd}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col-reverse lg:flex-row items-center gap-8 cursor-grab"
                tabIndex={0}
              >
                {/* Info */}
                <div className="flex-1 w-full max-w-[680px]">
                  <h2 className="text-2xl font-bold text-[#333]">
                    {treatment.name}
                  </h2>
                  <p className="text-[#9DC216] text-xl font-semibold mt-2">
                    {treatment.price}
                  </p>
                  <p className="text-gray-600 mt-3">{treatment.description}</p>

                  <ul className="mt-5 space-y-2">
                    {treatment.benefits.map((benefit, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-gray-700"
                      >
                        <FaCheckCircle className="text-[#9DC216]" />
                        {benefit}
                      </li>
                    ))}
                  </ul>

                  {/* Navigation Buttons */}
                  <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div className="flex gap-4">
                      <button
                        onClick={prev}
                        aria-label="Previous treatment"
                        className="p-3 bg-[#9DC216] text-white rounded-full hover:bg-[#7ba514] transition"
                      >
                        <FaArrowLeft size={20} />
                      </button>
                      <button
                        onClick={next}
                        aria-label="Next treatment"
                        className="p-3 bg-[#9DC216] text-white rounded-full hover:bg-[#7ba514] transition"
                      >
                        <FaArrowRight size={20} />
                      </button>
                    </div>
                  </div>

                  <a
                    href="#Booking"
                    className="bg-[#9DC216] text-white px-6 py-2 rounded-lg hover:bg-[#7ba514] transition w-full sm:w-auto text-center"
                  >
                    {t.cta}
                  </a>
                </div>

                {/* Imagen + Índice */}
                <div className="flex flex-col items-center">
                  <img
                    src={treatment.image}
                    alt={treatment.name}
                    className="w-full max-w-xs mb-6 h-auto object-cover rounded-xl shadow-md"
                  />
                  <span className="text-sm text-gray-500">
                    {t.treatmentLabel} {index + 1} {t.of} {t.treatments.length}
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          // Vista de grid mostrando todos los tratamientos (sin cambios)
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-10">
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {t.treatments.map((treatment, i) => (
                <motion.div
                  key={treatment.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-default flex flex-col"
                >
                  <img
                    src={treatment.image}
                    alt={treatment.name}
                    className="w-full object-cover rounded-lg mb-4"
                  />
                  <h3 className="text-xl font-semibold text-[#333]">
                    {treatment.name}
                  </h3>
                  <p className="text-[#9DC216] font-semibold mt-1">
                    {treatment.price}
                  </p>
                  <p className="text-gray-600 mt-2 flex-grow">
                    {treatment.description}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {treatment.benefits.map((benefit, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-gray-700"
                      >
                        <FaCheckCircle className="text-[#9DC216]" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Toggle button */}
        <div className="mt-10 text-center">
          <button
            onClick={() => setShowAll((prev) => !prev)}
            className="inline-block bg-[#9DC216] text-white px-6 py-3 rounded-lg hover:bg-[#7ba514] transition"
          >
            {showAll ? t.backToCarousel : t.viewAll}
          </button>
        </div>
      </div>
    </section>
  );
}

export default Treatments;

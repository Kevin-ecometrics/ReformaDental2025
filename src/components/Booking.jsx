import React, { useState, useEffect } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import {
  FaCalendarAlt,
  FaClock,
  FaUser,
  FaEnvelope,
  FaPhone,
  FaCheckCircle,
  FaStethoscope,
  FaShieldAlt,
  FaStar,
} from "react-icons/fa";
import {
  PDFDownloadLink,
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import { toast, Toaster } from "react-hot-toast";

const API_BASE = "https://reformadental.com";

const CLINIC_ADDRESS = "8169-206 Ignacio Zaragoza, Zona Centro, Tijuana, Baja California, México";
const CLINIC_PHONE_DISPLAY = "+1 619-586-1436";
const CLINIC_LOGO_URL = "https://reformadental.com/images/logo.webp";

const PDF = {
  primary: "#BD155C",
  primaryDark: "#8f1046",
  accent: "#9DC216",
  accentBg: "#eef7d9",
  accentText: "#5c7a0f",
  textDark: "#374151",
  textMuted: "#6b7280",
  cardBg: "#fdf1f6",
  border: "#e8e2e4",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    paddingBottom: 46,
    fontFamily: "Helvetica",
    backgroundColor: PDF.white,
  },
  topBar: { height: 8, backgroundColor: PDF.primary },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    paddingTop: 26,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 40, height: 38 },
  brandName: { fontSize: 15, fontWeight: "bold", color: PDF.textDark, letterSpacing: 1 },
  brandTagline: { fontSize: 8, color: PDF.accent, letterSpacing: 1.5, marginTop: 3 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: PDF.accentBg,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: PDF.accent },
  statusText: { fontSize: 8, fontWeight: "bold", color: PDF.accentText, letterSpacing: 0.5 },

  titleBlock: { paddingHorizontal: 40, paddingTop: 28, paddingBottom: 4 },
  title: { fontSize: 21, fontWeight: "bold", color: PDF.textDark },
  subtitle: { fontSize: 10, color: PDF.textMuted, marginTop: 5, lineHeight: 1.4 },

  section: { paddingHorizontal: 40, marginTop: 22 },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: PDF.primary,
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: "uppercase",
  },

  detailCard: {
    flexDirection: "row",
    backgroundColor: PDF.cardBg,
    borderRadius: 10,
    padding: 18,
  },
  detailCol: { flex: 1, paddingRight: 8 },
  detailLabel: { fontSize: 8, color: PDF.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  detailValue: { fontSize: 12, fontWeight: "bold", color: PDF.textDark },

  infoTable: { borderWidth: 1, borderColor: PDF.border, borderRadius: 10 },
  infoRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { width: 110, fontSize: 9, color: PDF.textMuted },
  infoValue: { flex: 1, fontSize: 10, color: PDF.textDark, fontWeight: "bold" },

  locationRow: { flexDirection: "row", gap: 24, alignItems: "flex-start" },
  locationText: { flex: 1 },
  locationName: { fontSize: 11, fontWeight: "bold", color: PDF.textDark, marginBottom: 4 },
  locationAddr: { fontSize: 9.5, color: PDF.textMuted, lineHeight: 1.5 },
  locationPhone: { fontSize: 9.5, color: PDF.primary, marginTop: 6, fontWeight: "bold" },
  qrCode: { width: 88, height: 88 },
  qrCaption: { fontSize: 7, color: PDF.textMuted, textAlign: "center", marginTop: 4, width: 88 },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: PDF.primaryDark,
    paddingVertical: 14,
    paddingHorizontal: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: { fontSize: 8, color: "#f6dde8" },
  footerTagline: { fontSize: 8, color: "#f6dde8", fontStyle: "italic" },
});

function Booking() {
  const [isEnglish, setIsEnglish] = useState(true);

  useEffect(() => {
    setIsEnglish(!window.location.pathname.startsWith("/es"));
  }, []);

  const [selectedDate, setSelectedDate] = useState(null);
  const [showAllDays, setShowAllDays] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [service, setService] = useState("");
  const [hasInsurance, setHasInsurance] = useState(false);
  const [insurance, setInsurance] = useState("");
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [qrCodeDataURL, setQrCodeDataURL] = useState("");
  const [logoDataURL, setLogoDataURL] = useState("");
  const [loading, setLoading] = useState(false);

  const days = Array.from({ length: showAllDays ? 30 : 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return date;
  });

  const hourSlots = Array.from({ length: 9 }, (_, i) => 9 + i);

  const fetchBookedSlots = () => {
    setLoading(true);
    axios
      .get(`${API_BASE}/api/citas/ocupadas`)
      .then((response) => {
        const data = Array.isArray(response.data) ? response.data : [];
        const slots = data.map((item) => ({
          fecha: item.fecha,
          hora: typeof item.hora === "string" ? item.hora.slice(0, 5) : item.hora,
        }));
        setBookedSlots(slots);
      })
      .catch((error) => {
        console.error("Error al cargar citas ocupadas:", error);
        setBookedSlots([]);
      })
      .finally(() => setLoading(false));
  };

  const fetchBlockedDates = () => {
    axios
      .get(`${API_BASE}/fechas-bloqueadas`)
      .then((response) => {
        const data = Array.isArray(response.data) ? response.data : [];
        setBlockedSlots(data.map((item) => ({
          fecha: item.date,
          hora: item.hour,
        })));
      })
      .catch((error) => {
        console.error("Error al cargar fechas bloqueadas:", error);
        setBlockedSlots([]);
      });
  };

  useEffect(() => {
    fetchBookedSlots();
    fetchBlockedDates();
  }, []);

  useEffect(() => {
    QRCode.toDataURL("https://maps.app.goo.gl/ChJasXTaFvvXdn6W8")
      .then(setQrCodeDataURL)
      .catch((err) => console.error("Error al generar QR:", err));
  }, []);

  // @react-pdf/renderer solo soporta PNG/JPG, así que el logo (.webp) se
  // convierte a PNG en un canvas antes de usarlo en el PDF.
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        setLogoDataURL(canvas.toDataURL("image/png"));
      } catch (err) {
        console.error("Error al convertir el logo para el PDF:", err);
      }
    };
    img.onerror = (err) => console.error("Error al cargar el logo:", err);
    img.src = CLINIC_LOGO_URL;
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedDate || !selectedTime || !name || !email || !phone) {
      toast.error(
        isEnglish
          ? "Please complete all fields."
          : "Por favor, completa todos los campos."
      );
      return;
    }

    setLoading(true);

    const fecha = format(selectedDate, "yyyy-MM-dd");
    const [h, m] = selectedTime.split(":");
    const hora = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;

    const payload = {
      nombre_paciente: name,
      correo: email,
      telefono: phone,
      fecha,
      hora,
      primera_visita: isFirstVisit ? 1 : 0,
      servicio: isFirstVisit ? service : "",
      seguro: hasInsurance ? insurance : "Sin seguro",
      origen: "web",
    };

    const endpoint = isEnglish
      ? `${API_BASE}/api/citas/agendar-en`
      : `${API_BASE}/api/citas/agendar`;

    try {
      await axios.post(endpoint, payload);
      if (window.fbq) {
        window.fbq("track", "Schedule", {
          content_name: "Appointment Booking",
          status: isFirstVisit ? service || "General consultation" : "Returning patient",
        });
        console.log("[Meta Pixel] Schedule", { isFirstVisit, service });
      }
      setTicket({ name, email, phone, fecha, hora, isFirstVisit, service, insurance: hasInsurance ? insurance : "Sin seguro" });
      setIsTicketModalOpen(true);
      setName("");
      setEmail("");
      setPhone("");
      setIsFirstVisit(false);
      setService("");
      setHasInsurance(false);
      setInsurance("");
      setSelectedDate(null);
      setSelectedTime(null);
      toast.success(
        isEnglish
          ? "Appointment successfully scheduled!"
          : "¡Cita agendada exitosamente!"
      );
    } catch (error) {
      const status = error.response?.status;
      if (status === 409) {
        toast.error(
          isEnglish
            ? "That time slot is no longer available."
            : "Ese horario ya no está disponible."
        );
      } else {
        console.error("Error al reservar:", error);
        toast.error(
          isEnglish
            ? "Error making the reservation. Please try again."
            : "Error al realizar la reservación. Intenta de nuevo."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsTicketModalOpen(false);
    fetchBookedSlots();
  };

  const hasTakenSlots = (day) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return bookedSlots.some((s) => s.fecha === dayStr) || blockedSlots.some((s) => s.fecha === dayStr);
  };

  const formatHourLabel = (hour) => {
    if (hour === 12) return "12:00 PM";
    if (hour === 0) return "12:00 AM";
    return hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
  };

  const isSlotTaken = (day, hour) => {
    const paddedHour = `${String(hour).padStart(2, "0")}:00`;
    const dayStr = format(day, "yyyy-MM-dd");
    const isBooked = bookedSlots.some(
      (s) => s.fecha === dayStr && s.hora === paddedHour
    );
    const isBlocked = blockedSlots.some(
      (s) => s.fecha === dayStr && s.hora === paddedHour
    );
    return isBooked || isBlocked;
  };

  const AppointmentPDF = ({ ticket }) => (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} fixed />

        <View style={styles.header}>
          <View style={styles.brandRow}>
            {logoDataURL && <Image src={logoDataURL} style={styles.logo} />}
            <View>
              <Text style={styles.brandName}>DENTAL REFORMA</Text>
              <Text style={styles.brandTagline}>TIJUANA · B.C.</Text>
            </View>
          </View>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {isEnglish ? "CONFIRMED" : "CONFIRMADA"}
            </Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.title}>
            {isEnglish ? "Appointment Voucher" : "Comprobante de Cita"}
          </Text>
          <Text style={styles.subtitle}>
            {isEnglish
              ? `Thank you, ${ticket.name}. Please keep this voucher and bring it to your visit.`
              : `Gracias, ${ticket.name}. Conserva este comprobante y preséntalo en tu visita.`}
          </Text>
        </View>

        {/* Fecha / hora / paciente */}
        <View style={styles.section}>
          <View style={styles.detailCard}>
            <View style={styles.detailCol}>
              <Text style={styles.detailLabel}>{isEnglish ? "Date" : "Fecha"}</Text>
              <Text style={styles.detailValue}>{ticket.fecha}</Text>
            </View>
            <View style={styles.detailCol}>
              <Text style={styles.detailLabel}>{isEnglish ? "Time" : "Hora"}</Text>
              <Text style={styles.detailValue}>{ticket.hora}</Text>
            </View>
            <View style={styles.detailCol}>
              <Text style={styles.detailLabel}>{isEnglish ? "Patient" : "Paciente"}</Text>
              <Text style={styles.detailValue}>{ticket.name}</Text>
            </View>
          </View>
        </View>

        {/* Información del paciente */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {isEnglish ? "Patient Information" : "Información del Paciente"}
          </Text>
          <View style={styles.infoTable}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{ticket.email}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{isEnglish ? "Phone" : "Teléfono"}</Text>
              <Text style={styles.infoValue}>{ticket.phone}</Text>
            </View>
            {ticket.isFirstVisit && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{isEnglish ? "Service" : "Servicio"}</Text>
                <Text style={styles.infoValue}>
                  {ticket.service || (isEnglish ? "General consultation" : "Consulta general")}
                </Text>
              </View>
            )}
            <View style={[styles.infoRow, styles.infoRowLast]}>
              <Text style={styles.infoLabel}>{isEnglish ? "Insurance" : "Seguro"}</Text>
              <Text style={styles.infoValue}>{ticket.insurance}</Text>
            </View>
          </View>
        </View>

        {/* Ubicación + QR */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{isEnglish ? "Location" : "Ubicación"}</Text>
          <View style={styles.locationRow}>
            <View style={styles.locationText}>
              <Text style={styles.locationName}>Dental Reforma</Text>
              <Text style={styles.locationAddr}>{CLINIC_ADDRESS}</Text>
              <Text style={styles.locationPhone}>{CLINIC_PHONE_DISPLAY}</Text>
            </View>
            {qrCodeDataURL && (
              <View>
                <Image src={qrCodeDataURL} style={styles.qrCode} />
                <Text style={styles.qrCaption}>
                  {isEnglish ? "Scan for directions" : "Escanea para direcciones"}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            reformadental.com &middot; {CLINIC_PHONE_DISPLAY}
          </Text>
          <Text style={styles.footerTagline}>
            {isEnglish ? "Smile, it's the best choice" : "Sonríe, es la mejor decisión"}
          </Text>
        </View>
      </Page>
    </Document>
  );

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#BD155C]/30 focus:border-[#BD155C] transition-all text-sm";
  const labelClass = "text-sm font-semibold text-gray-700 flex items-center gap-2";
  const checkboxClass = "w-5 h-5 rounded border-gray-300 text-[#BD155C] focus:ring-[#BD155C] cursor-pointer";

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8">
      <Toaster position="top-right" />
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
          {isEnglish ? "Schedule Your Appointment" : "Agenda Tu Cita"}
        </h1>
        <p className="text-gray-500 text-sm">
          {isEnglish
            ? "Choose a date and time that works best for you"
            : "Elige la fecha y hora que mejor te funcione"}
        </p>
      </div>

      {/* Date selection */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
          <FaCalendarAlt className="text-[#BD155C]" />
          {isEnglish ? "Select a Date" : "Selecciona una Fecha"}
        </h2>
        <div className="grid grid-cols-7 gap-2">
            {days.map((day) => {
          const isSunday = day.getDay() === 0;
          const formattedDate = format(day, "yyyy-MM-dd");
          const isSelected =
            selectedDate && format(selectedDate, "yyyy-MM-dd") === formattedDate;
          const taken = hasTakenSlots(day);
          const isFullyBooked = taken && hourSlots.every((hour) => isSlotTaken(day, hour));
          return (
            <button
              key={formattedDate}
              onClick={() => !isSunday && setSelectedDate(day)}
              disabled={isSunday || isFullyBooked || loading}
              className={`p-3 rounded-xl text-sm font-medium transition-all ${
                isSunday || isFullyBooked
                  ? "bg-red-50 text-red-400 cursor-not-allowed line-through"
                  : taken && !isFullyBooked
                  ? "bg-orange-50 text-orange-600 border border-orange-200"
                  : isSelected
                  ? "bg-[#BD155C] text-white shadow-md shadow-[#BD155C]/20"
                  : "bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200"
              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {format(day, isEnglish ? "EEE, MMM d" : "EEE, d MMM")}
              {taken && !isFullyBooked && (
                <span className="block text-[10px] opacity-75 mt-0.5">
                  {isEnglish ? "limited" : "ocupado"}
                </span>
              )}
            </button>
          );
        })}
        </div>

        {!showAllDays && (
          <button
            onClick={() => setShowAllDays(true)}
            className="mt-4 w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
            disabled={loading}
          >
            {isEnglish ? "Show more dates" : "Mostrar más fechas"}
          </button>
        )}
      </div>

      {/* Time selection */}
      {selectedDate && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <FaClock className="text-[#BD155C]" />
            {isEnglish ? "Select a Time" : "Selecciona una Hora"}
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {hourSlots.map((hour) => {
              const booked = isSlotTaken(selectedDate, hour);
              const now = new Date();
              const isToday =
                format(selectedDate, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
              const isPast = isToday && hour <= now.getHours();
              const isDisabled = booked || isPast;
              const timeStr = `${hour}:00`;
              const isSelectedTime = selectedTime === timeStr;

              return (
                <button
                  key={hour}
                  onClick={() => !isDisabled && setSelectedTime(timeStr)}
                  disabled={isDisabled || loading}
                  className={`py-3 rounded-xl text-sm font-medium transition-all ${
                    isDisabled
                      ? "bg-red-50 text-red-300 cursor-not-allowed line-through"
                      : isSelectedTime
                      ? "bg-[#BD155C] text-white shadow-md shadow-[#BD155C]/20"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200"
                  } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {formatHourLabel(hour)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Patient form */}
      {selectedDate && selectedTime && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5"
        >
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-2">
            <FaUser className="text-[#BD155C]" />
            {isEnglish ? "Your Information" : "Tu Información"}
          </h2>

          <div>
            <label className={labelClass}>
              <FaUser className="text-gray-400" size={14} />
              {isEnglish ? "Full Name" : "Nombre Completo"}
            </label>
            <input
              type="text"
              placeholder={isEnglish ? "John Doe" : "Juan Pérez"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
              disabled={loading}
            />
          </div>

          <div>
            <label className={labelClass}>
              <FaEnvelope className="text-gray-400" size={14} />
              Email
            </label>
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClass}
              disabled={loading}
            />
          </div>

          <div>
            <label className={labelClass}>
              <FaPhone className="text-gray-400" size={14} />
              {isEnglish ? "Phone Number" : "Número de Teléfono"}
            </label>
            <input
              type="tel"
              placeholder="+52 664 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              maxLength={15}
              className={inputClass}
              disabled={loading}
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isFirstVisit}
                onChange={(e) => {
                  setIsFirstVisit(e.target.checked);
                  if (!e.target.checked) setService("");
                }}
                className={checkboxClass}
                disabled={loading}
              />
              <div>
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <FaStar className="text-yellow-500" size={14} />
                  {isEnglish ? "First Visit" : "Primera Visita"}
                </span>
                <span className="text-xs text-gray-400">
                  {isEnglish ? "Check if this is your first appointment" : "Marca si es tu primera cita"}
                </span>
              </div>
            </label>

            {isFirstVisit && (
              <div className="mt-3 pl-8">
                <label className={labelClass}>
                  <FaStethoscope className="text-gray-400" size={14} />
                  {isEnglish ? "Service Required" : "Servicio Requerido"}
                </label>
                <input
                  type="text"
                  placeholder={
                    isEnglish
                      ? "e.g. General checkup, Cleaning, etc."
                      : "Ej. Consulta general, Limpieza, etc."
                  }
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className={inputClass}
                  disabled={loading}
                />
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasInsurance}
                onChange={(e) => {
                  setHasInsurance(e.target.checked);
                  if (!e.target.checked) setInsurance("");
                }}
                className={checkboxClass}
                disabled={loading}
              />
              <div>
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <FaShieldAlt className="text-blue-500" size={14} />
                  {isEnglish ? "Medical Insurance" : "Seguro Médico"}
                </span>
                <span className="text-xs text-gray-400">
                  {isEnglish ? "Check if you have dental insurance" : "Marca si cuentas con seguro dental"}
                </span>
              </div>
            </label>

            {hasInsurance && (
              <div className="mt-3 pl-8">
                <label className={labelClass}>
                  <FaShieldAlt className="text-gray-400" size={14} />
                  {isEnglish ? "Insurance Name" : "Nombre del Seguro"}
                </label>
                <input
                  type="text"
                  placeholder={
                    isEnglish
                      ? "e.g. MetLife, Delta Dental, etc."
                      : "Ej. MetLife, Delta Dental, etc."
                  }
                  value={insurance}
                  onChange={(e) => setInsurance(e.target.value)}
                  className={inputClass}
                  disabled={loading}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-[#BD155C] text-white rounded-xl font-semibold hover:bg-[#a0124e] transition-all shadow-lg shadow-[#BD155C]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            disabled={loading}
          >
            {loading && (
              <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            )}
            {isEnglish ? "Confirm Appointment" : "Confirmar Cita"}
          </button>
        </form>
      )}

      {/* Confirmation modal */}
      {isTicketModalOpen && ticket && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
          <div className="bg-white p-8 md:p-10 rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <FaCheckCircle className="text-green-500 text-3xl" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">
                {isEnglish ? "Appointment Confirmed!" : "¡Cita Confirmada!"}
              </h2>
              <p className="text-gray-500 text-center text-sm">
                {isEnglish
                  ? "Your appointment has been successfully scheduled. We'll send you a reminder."
                  : "Tu cita ha sido agendada exitosamente. Te enviaremos un recordatorio."}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{isEnglish ? "Date" : "Fecha"}</span>
                <span className="font-semibold text-gray-800">{ticket.fecha}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{isEnglish ? "Time" : "Hora"}</span>
                <span className="font-semibold text-gray-800">{ticket.hora}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{isEnglish ? "Patient" : "Paciente"}</span>
                <span className="font-semibold text-gray-800">{ticket.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-semibold text-gray-800">{ticket.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{isEnglish ? "Phone" : "Teléfono"}</span>
                <span className="font-semibold text-gray-800">{ticket.phone}</span>
              </div>
              {ticket.isFirstVisit && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{isEnglish ? "Service" : "Servicio"}</span>
                  <span className="font-semibold text-gray-800">{ticket.service || (isEnglish ? "General consultation" : "Consulta general")}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">{isEnglish ? "Insurance" : "Seguro"}</span>
                <span className="font-semibold text-gray-800">{ticket.insurance}</span>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <span className="text-gray-400 text-xs block text-center">
                  {CLINIC_ADDRESS}
                </span>
              </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCloseModal}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition font-medium"
              >
                {isEnglish ? "Close" : "Cerrar"}
              </button>
              <PDFDownloadLink
                document={<AppointmentPDF ticket={ticket} />}
                fileName="appointment.pdf"
                className="flex-1 py-3 bg-[#BD155C] text-white rounded-xl hover:bg-[#a0124e] transition font-medium text-center"
              >
                {isEnglish ? "Download PDF" : "Descargar PDF"}
              </PDFDownloadLink>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Booking;

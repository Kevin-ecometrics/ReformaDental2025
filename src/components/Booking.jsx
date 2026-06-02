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
} from "react-icons/fa";
import {
  PDFDownloadLink,
  Document,
  Page,
  Text,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import { toast, Toaster } from "react-hot-toast";

const API_BASE = "https://www.reformadental.com";

const styles = StyleSheet.create({
  page: { padding: 30 },
  section: { marginBottom: 10 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  text: { fontSize: 12 },
  qrCode: { marginTop: 40, alignSelf: "center", width: 300, height: 300 },
});

function Booking() {
  // Start with true (English) and correct on the client to avoid hydration mismatch #418
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
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [qrCodeDataURL, setQrCodeDataURL] = useState("");
  const [loading, setLoading] = useState(false);

  const days = Array.from({ length: showAllDays ? 30 : 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return date;
  });

  const hourSlots = Array.from({ length: 9 }, (_, i) => 9 + i); // 9 AM – 5 PM

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
    // Ensure zero-padded HH:MM (selectedTime may be "9:00")
    const [h, m] = selectedTime.split(":");
    const hora = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;

    const payload = {
      nombre_paciente: name,
      correo: email,
      telefono: phone,
      fecha,
      hora,
    };

    const endpoint = isEnglish
      ? `${API_BASE}/api/citas/agendar-en`
      : `${API_BASE}/api/citas/agendar`;

    try {
      await axios.post(endpoint, payload);
      setTicket({ name, email, phone, fecha, hora });
      setIsTicketModalOpen(true);
      setName("");
      setEmail("");
      setPhone("");
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
        <Text style={styles.title}>
          {isEnglish ? "Appointment Details" : "Detalles de la Cita"}
        </Text>
        <Text style={styles.section}>
          <Text style={styles.text}>
            {isEnglish ? "Date:" : "Fecha:"} {ticket.fecha}
          </Text>
        </Text>
        <Text style={styles.section}>
          <Text style={styles.text}>
            {isEnglish ? "Time:" : "Hora:"} {ticket.hora}
          </Text>
        </Text>
        <Text style={styles.section}>
          <Text style={styles.text}>
            {isEnglish ? "Name:" : "Nombre:"} {ticket.name}
          </Text>
        </Text>
        <Text style={styles.section}>
          <Text style={styles.text}>
            {isEnglish ? "Email:" : "Correo:"} {ticket.email}
          </Text>
        </Text>
        <Text style={styles.section}>
          <Text style={styles.text}>
            {isEnglish ? "Phone:" : "Teléfono:"} {ticket.phone}
          </Text>
        </Text>
        <Text style={styles.section}>
          <Text style={styles.text}>
            {isEnglish ? "Location:" : "Ubicación:"} Avenida Paseo Reforma
            5304, Tijuana, Baja California, México
          </Text>
        </Text>
        <Text style={styles.section}>
          {isEnglish
            ? "Scan the QR code for directions:"
            : "Escanea el código QR para obtener direcciones:"}
        </Text>
        {qrCodeDataURL && (
          <Image src={qrCodeDataURL} style={styles.qrCode} />
        )}
      </Page>
    </Document>
  );

  return (
    <div className="flex flex-col items-start gap-6 p-6">
      <Toaster position="top-right" />
      <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
        <FaCalendarAlt className="text-green-500" />
        {isEnglish ? "Schedule Appointment" : "Agendar Cita"}
      </h1>

      {/* Date selection */}
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
              className={`p-3 rounded-lg text-sm font-medium transition ${
                isSunday || isFullyBooked
                  ? "bg-red-500 text-white cursor-not-allowed"
                  : taken && !isFullyBooked
                  ? "bg-orange-400 text-white"
                  : isSelected
                  ? "bg-green-500 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-800"
              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {format(day, isEnglish ? "EEE, MMM d" : "EEE, d MMM")}
              {taken && !isFullyBooked && (
                <span className="block text-[10px] opacity-75">
                  {isEnglish ? "some taken" : "ocupado"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!showAllDays && (
        <button
          onClick={() => setShowAllDays(true)}
          className="mt-2 px-8 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          disabled={loading}
        >
          {isEnglish ? "Show more dates" : "Mostrar más fechas"}
        </button>
      )}

      {/* Time selection */}
      {selectedDate && (
        <div className="flex flex-col items-start gap-6 w-full">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaClock className="text-green-500" />
            {isEnglish ? "Select a Time" : "Selecciona una hora"}
          </h2>
          <div className="grid grid-cols-5 gap-2">
            {hourSlots.map((hour) => {
              const booked = isSlotTaken(selectedDate, hour);
              const now = new Date();
              const isToday =
                format(selectedDate, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
              const isPast = isToday && hour <= now.getHours();
              const isDisabled = booked || isPast;
              const timeStr = `${hour}:00`;
              const isSelected = selectedTime === timeStr;

              return (
                <button
                  key={hour}
                  onClick={() => !isDisabled && setSelectedTime(timeStr)}
                  disabled={isDisabled || loading}
                  className={`p-2 rounded-lg text-sm font-medium transition ${
                    isDisabled
                      ? "bg-red-500 text-white cursor-not-allowed"
                      : isSelected
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-800"
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
          className="flex flex-col items-start gap-4 w-full max-w-md"
        >
          <div className="flex items-center gap-2 w-full">
            <FaUser className="text-gray-500" />
            <input
              type="text"
              placeholder={isEnglish ? "Name" : "Nombre"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border p-2 rounded-md w-full"
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-2 w-full">
            <FaEnvelope className="text-gray-500" />
            <input
              type="email"
              placeholder={isEnglish ? "Email" : "Correo"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border p-2 rounded-md w-full"
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-2 w-full">
            <FaPhone className="text-gray-500" />
            <input
              type="tel"
              placeholder={isEnglish ? "Phone" : "Teléfono"}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              maxLength={10}
              className="border p-2 rounded-md w-full"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className="bg-green-500 text-white p-2 rounded-md w-full hover:bg-green-600 transition flex items-center justify-center"
            disabled={loading}
          >
            {loading && (
              <span className="animate-spin mr-2 w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            )}
            {isEnglish ? "Schedule" : "Agendar"}
          </button>
        </form>
      )}

      {/* Confirmation modal */}
      {isTicketModalOpen && ticket && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-10 rounded-lg shadow-2xl max-w-2xl w-full">
            <div className="flex flex-col items-center gap-6">
              <FaCheckCircle className="text-green-500 text-6xl" />
              <h2 className="text-3xl font-bold text-gray-800">
                {isEnglish ? "Appointment Confirmed" : "Cita Confirmada"}
              </h2>
              <p className="text-lg text-gray-600 text-center">
                {isEnglish
                  ? "Your appointment has been successfully scheduled."
                  : "Tu cita ha sido agendada exitosamente."}
              </p>
            </div>
            <div className="mt-6 border-t pt-6 space-y-2">
              <p className="text-lg">
                <strong>{isEnglish ? "Date:" : "Fecha:"}</strong> {ticket.fecha}
              </p>
              <p className="text-lg">
                <strong>{isEnglish ? "Time:" : "Hora:"}</strong> {ticket.hora}
              </p>
              <p className="text-lg">
                <strong>{isEnglish ? "Name:" : "Nombre:"}</strong> {ticket.name}
              </p>
              <p className="text-lg">
                <strong>{isEnglish ? "Email:" : "Correo:"}</strong> {ticket.email}
              </p>
              <p className="text-lg">
                <strong>{isEnglish ? "Phone:" : "Teléfono:"}</strong> {ticket.phone}
              </p>
              <p className="text-lg">
                <strong>{isEnglish ? "Location:" : "Ubicación:"}</strong>{" "}
                Avenida Paseo Reforma 5304, Tijuana, Baja California, México
              </p>
            </div>
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={handleCloseModal}
                className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
              >
                {isEnglish ? "Close" : "Cerrar"}
              </button>
              <PDFDownloadLink
                document={<AppointmentPDF ticket={ticket} />}
                fileName="appointment.pdf"
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
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

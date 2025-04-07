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
import QRCode from "qrcode"; // Usaremos la librería qrcode para generar el QR como base64

const styles = StyleSheet.create({
  page: { padding: 30 },
  section: { marginBottom: 10 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  text: { fontSize: 12 },
  qrCode: { marginTop: 40, alignSelf: "center", width: 300, height: 300 }, // QR más grande
});

function Booking() {
  const isEnglish =
    typeof window !== "undefined" && window.location.pathname !== "/es";

  const [selectedDate, setSelectedDate] = useState(null);
  const [showAllDays, setShowAllDays] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);
  const [bookedHours, setBookedHours] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [qrCodeDataURL, setQrCodeDataURL] = useState(""); // Estado para almacenar el QR como base64
  const days = Array.from({ length: showAllDays ? 30 : 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return date;
  });

  const hours = Array.from({ length: 9 }, (_, i) => 9 + i); // Horas de 9:00 AM a 5:00 PM

  const fetchBookedHours = () => {
    axios
      .get("https://www.reformadental.com/fechas-seleccionadas")
      .then((response) => {
        const adjustedHours = response.data.map((item) => ({
          date: item.date,
          hour: item.hour.slice(0, 5),
        }));
        setBookedHours(adjustedHours);
      })
      .catch((error) =>
        console.error("Error al cargar las horas reservadas:", error)
      );
  };

  useEffect(() => {
    fetchBookedHours();
  }, []);

  const generateQRCode = async () => {
    try {
      const qrCode = await QRCode.toDataURL(
        "https://maps.app.goo.gl/ChJasXTaFvvXdn6W8"
      );
      setQrCodeDataURL(qrCode); // Guardar el QR como base64
    } catch (error) {
      console.error("Error al generar el código QR:", error);
    }
  };

  useEffect(() => {
    generateQRCode(); // Generar el QR al cargar el componente
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedDate || !selectedTime || !name || !email || !phone) {
      alert(
        isEnglish
          ? "Please complete all fields."
          : "Por favor, completa todos los campos."
      );
      return;
    }

    const selectedDateTime = new Date(selectedDate);
    const [hours, minutes] = selectedTime.split(":").map(Number);
    selectedDateTime.setHours(hours, minutes, 0, 0);

    const bookingData = {
      name,
      email,
      phone,
      date: format(selectedDateTime, "yyyy-MM-dd HH:mm:ss"),
    };

    try {
      await axios.post(
        "https://www.reformadental.com/guardar-datos",
        bookingData
      );
      setTicket(bookingData);
      setIsTicketModalOpen(true);
      setName("");
      setEmail("");
      setPhone("");
      setSelectedDate(null);
      setSelectedTime(null);
    } catch (error) {
      console.error("Error al realizar la reservación:", error);
      alert(
        isEnglish
          ? "Error making the reservation."
          : "Error al realizar la reservación."
      );
    }
  };

  const handleCloseModal = () => {
    setIsTicketModalOpen(false);
    fetchBookedHours();
  };

  const formatHour = (hour) => {
    if (hour === 12) return "12:00 PM";
    if (hour === 0) return "12:00 AM";
    return hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
  };

  const AppointmentPDF = ({ ticket }) => (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {isEnglish ? "Appointment Details" : "Detalles de la Cita"}
        </Text>
        <Text style={styles.section}>
          <Text style={styles.text}>
            {isEnglish ? "Date and Time:" : "Fecha y Hora:"}{" "}
            {format(parseISO(ticket.date), "EEEE, MMMM d, yyyy 'at' h:mm a")}
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
            {isEnglish ? "Location:" : "Ubicación:"} 8169-206 Ignacio Zaragoza,
            Zona Centro, Tijuana, Baja California, México
          </Text>
        </Text>
        <Text style={styles.section}>
          {isEnglish
            ? "Scan the QR code for directions:"
            : "Escanea el código QR para obtener direcciones:"}
        </Text>
        {qrCodeDataURL && (
          <Image src={qrCodeDataURL} style={styles.qrCode} alt="QR Code" />
        )}
      </Page>
    </Document>
  );

  return (
    <div className="flex flex-col items-start gap-6 p-6">
      <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
        <FaCalendarAlt className="text-green-500" />{" "}
        {isEnglish ? "Schedule Appointment" : "Agendar Cita"}
      </h1>

      {/* Selección de Fecha */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const isSunday = day.getDay() === 0;
          const formattedDate = format(day, "yyyy-MM-dd");
          return (
            <button
              key={formattedDate}
              onClick={() => setSelectedDate(day)}
              disabled={isSunday}
              className={`p-3 rounded-lg text-sm font-medium ${
                isSunday
                  ? "bg-red-500 text-white cursor-not-allowed"
                  : selectedDate &&
                    format(selectedDate, "yyyy-MM-dd") === formattedDate
                  ? "bg-green-500 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-800"
              }`}
            >
              {format(day, isEnglish ? "EEE, MMM d" : "EEE, d MMM")}
            </button>
          );
        })}
      </div>
      {!showAllDays && (
        <button
          onClick={() => setShowAllDays(true)}
          className="mt-2 px-8 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
        >
          {isEnglish ? "Show more dates" : "Mostrar más fechas"}
        </button>
      )}
      {/* Selección de Hora */}
      {selectedDate && (
        <div className="flex flex-col items-start gap-6 w-full">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaClock className="text-green-500" />{" "}
            {isEnglish ? "Select a Time" : "Selecciona una hora"}
          </h2>
          <div className="grid grid-cols-5 gap-2">
            {hours.map((hour) => {
              const time24 = `${hour < 10 ? `0${hour}` : hour}:00`;
              const isBooked = bookedHours.some(
                (bh) =>
                  bh.date === format(selectedDate, "yyyy-MM-dd") &&
                  bh.hour === time24
              );

              const now = new Date();
              const isToday =
                format(selectedDate, "yyyy-MM-dd") ===
                format(now, "yyyy-MM-dd");
              const currentHour = now.getHours();

              const isPastHour = isToday && hour <= currentHour;

              const isDisabled = isBooked || isPastHour;

              return (
                <button
                  key={hour}
                  onClick={() => setSelectedTime(`${hour}:00`)}
                  disabled={isDisabled}
                  className={`p-2 rounded-lg text-sm font-medium ${
                    isBooked || isPastHour
                      ? "bg-red-500 text-white cursor-not-allowed"
                      : selectedTime === `${hour}:00`
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                  }`}
                >
                  {formatHour(hour)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Formulario de Datos */}
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
            />
          </div>
          <button
            type="submit"
            className="bg-green-500 text-white p-2 rounded-md w-full hover:bg-green-600 transition"
          >
            {isEnglish ? "Schedule" : "Agendar"}
          </button>
        </form>
      )}

      {/* Modal de Confirmación */}
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
            <div className="mt-6 border-t pt-6">
              <p className="text-lg">
                <strong>
                  {isEnglish ? "Date and Time:" : "Fecha y Hora:"}
                </strong>{" "}
                {format(
                  parseISO(ticket.date),
                  "EEEE, MMMM d, yyyy 'at' h:mm a"
                )}
              </p>
              <p className="text-lg">
                <strong>{isEnglish ? "Name:" : "Nombre:"}</strong> {ticket.name}
              </p>
              <p className="text-lg">
                <strong>{isEnglish ? "Email:" : "Correo:"}</strong>{" "}
                {ticket.email}
              </p>
              <p className="text-lg">
                <strong>{isEnglish ? "Phone:" : "Teléfono:"}</strong>{" "}
                {ticket.phone}
              </p>
              <p className="text-lg">
                <strong>{isEnglish ? "Location:" : "Ubicación:"}</strong>{" "}
                8169-206 Ignacio Zaragoza, Zona Centro, Tijuana, Baja
                California, México
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

import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, Modal, FlatList, TextInput, Alert } from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';


interface Class {
  id: string;
  name: string;
  teacher: string;
  room: string;
  startDate?: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  day: string;
  color: string;
  notes?: string;
  reminder?: string; 
  reminderId?: string; // scheduled notification id
}

interface Exam {
  id: string;
  subject: string;
  date: string;
  time: string;
  room: string;
  reminder?: string;
  reminderId?: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  days?: string[];
  date?: string;
  reminder?: string;
  reminderId?: string;
}

const SCHEDULE_DATA: { [key: string]: Class[] } = {
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: [],
  Saturday: [],
  Sunday: [],
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_VI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

// Hàm tính ngày đầu tuần (Thứ Hai)
const getWeekStartDate = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  return new Date(d.setDate(diff));
};

// Hàm format ngày
const formatDateVN = (date: Date): string => {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const dd = day < 10 ? `0${day}` : `${day}`;
  const mm = month < 10 ? `0${month}` : `${month}`;
  return `${dd}/${mm}/${year}`;
};

// Hàm lấy ngày của tuần
const getWeekDates = (startDate: Date): Date[] => {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
};

// Storage keys
const STORAGE_KEYS = {
  SCHEDULE: 'tkb_schedule_v1',
  EXAMS: 'tkb_exams_v1',
  NOTES: 'tkb_notes_v1',
};

// Time helpers
const isValidTimeFormat = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const compareTimeStrings = (a: string, b: string) => {
  const pa = a.split(':').map(Number);
  const pb = b.split(':').map(Number);
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  return pa[1] - pb[1];
};

// Date helpers (DD/MM/YYYY)
const isValidDateDDMMYYYY = (s: string) => {
  if (!s || typeof s !== 'string') return false;
  const parts = s.split('/').map(Number);
  if (parts.length !== 3) return false;
  const [d, m, y] = parts;
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return false;
  if (y < 1000 || m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d > daysInMonth) return false;
  return true;
};

const normalizeDateDDMMYYYY = (s: string) => {
  if (!s || typeof s !== 'string') return s;
  const parts = s.split('/').map(Number);
  if (parts.length !== 3) return s;
  const [d, m, y] = parts;
  const dd = d < 10 ? `0${d}` : `${d}`;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${dd}/${mm}/${y}`;
};

export default function App() {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [currentWeek, setCurrentWeek] = useState(getWeekStartDate(new Date()));
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [scheduleData, setScheduleData] = useState<{ [key: string]: Class[] }>(SCHEDULE_DATA);
  const [exams, setExams] = useState<Exam[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [formData, setFormData] = useState<Partial<Class>>({});
  const [examFormData, setExamFormData] = useState<Partial<Exam>>({});
  const [noteFormData, setNoteFormData] = useState<Partial<Note>>({});
  const [showExamList, setShowExamList] = useState(false);
  const [showAddChoiceModal, setShowAddChoiceModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const weekDates = useMemo(() => getWeekDates(currentWeek), [currentWeek]);

  // Load persisted data on mount
  useEffect(() => {
    const load = async () => {
      try {
        const sd = await AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE);
        const ex = await AsyncStorage.getItem(STORAGE_KEYS.EXAMS);
        const no = await AsyncStorage.getItem(STORAGE_KEYS.NOTES);
        if (sd) setScheduleData(JSON.parse(sd));
        if (ex) setExams(JSON.parse(ex));
        if (no) {
          try {
            const parsed = JSON.parse(no);
            // migrate legacy `day` -> `days` if needed
            const migrated = (parsed || []).map((n: any) => {
              if (n.days && Array.isArray(n.days)) return n;
              if (n.day) return { ...n, days: [n.day], day: undefined };
              return { ...n, days: (n.days || []) };
            });
            setNotes(migrated);
          } catch (err) {
            setNotes([]);
          }
        }
      } catch (e) {
        console.warn('Failed to load persisted data', e);
      } finally {
        setDataLoaded(true);
      }
    };
    load();
  }, []);

  // Persist on changes
  useEffect(() => {
    if (!dataLoaded) return;
    AsyncStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(scheduleData)).catch(() => {});
  }, [scheduleData, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    AsyncStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(exams)).catch(() => {});
  }, [exams, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes)).catch(() => {});
  }, [notes, dataLoaded]);

  // Reminder helpers
  const REMINDER_OFFSETS: { [key: string]: number } = {
    off: 0,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '1d': 1 * 24 * 60 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '30m': 30 * 60 * 1000,
  };

  const parseDateFromDDMMYYYY = (s: string): Date | null => {
    try {
      const parts = s.split('/').map(Number);
      if (parts.length !== 3) return null;
      return new Date(parts[2], parts[1] - 1, parts[0]);
    } catch (e) {
      return null;
    }
  };

  // TODO: Re-enable notification helpers when using development build
  // const scheduleNotification = async (title: string, body: string, triggerDate: Date) => { ... }
  // const cancelNotification = async (id?: string) => { ... }
  // const scheduleReminderForExam = async (exam: Exam) => { ... }
  // const scheduleReminderForNote = async (note: Note, dateForNote?: Date) => { ... }
  // const scheduleReminderForClass = async (cls: Class, weekStart?: Date) => { ... }

  const getScheduleForDay = (day: string) => {
    const classes = scheduleData[day] || [];
    const date = weekDates[selectedDayIndex];
    const filtered = classes.filter(cls => {
      // if class has startDate/endDate, only show within that range
      try {
        if (cls.startDate) {
          const sdParts = cls.startDate.split('/').map(Number);
          const sd = new Date(sdParts[2], sdParts[1] - 1, sdParts[0]);
          if (date < sd) return false;
        }
        if (cls.endDate) {
          const edParts = cls.endDate.split('/').map(Number);
          const ed = new Date(edParts[2], edParts[1] - 1, edParts[0]);
          if (date > ed) return false;
        }
      } catch (e) {
        // on parse error, fall back to showing the class
      }
      return true;
    });

    // sort by startTime
    filtered.sort((a, b) => {
      if (a.startTime && b.startTime && isValidTimeFormat(a.startTime) && isValidTimeFormat(b.startTime)) {
        return compareTimeStrings(a.startTime, b.startTime);
      }
      return 0;
    });

    return filtered;
  };

  const handleSaveClass = async () => {
    if (!formData.name || !formData.teacher || !formData.room || !formData.startTime || !formData.endTime) {
      Alert.alert('Thông báo', 'Vui lòng điền đầy đủ thông tin');
      return;
    }

    // validate time format
    if (!isValidTimeFormat(formData.startTime || '') || !isValidTimeFormat(formData.endTime || '')) {
      Alert.alert('Thông báo', 'Thời gian phải theo định dạng HH:MM (00:00 - 23:59)');
      return;
    }

    // ensure start < end
    if (compareTimeStrings(formData.startTime || '', formData.endTime || '') >= 0) {
      Alert.alert('Thông báo', 'Thời gian bắt đầu phải trước thời gian kết thúc');
      return;
    }

    // validate optional start/end dates if provided
    if (formData.startDate && (!isValidDateDDMMYYYY(formData.startDate))) {
      Alert.alert('Thông báo', 'Ngày bắt đầu không hợp lệ. Hãy nhập theo DD/MM/YYYY');
      return;
    }
    if (formData.endDate && (!isValidDateDDMMYYYY(formData.endDate))) {
      Alert.alert('Thông báo', 'Ngày kết thúc không hợp lệ. Hãy nhập theo DD/MM/YYYY');
      return;
    }
    if (formData.startDate && formData.endDate) {
      const sd = parseDateFromDDMMYYYY(formData.startDate as string);
      const ed = parseDateFromDDMMYYYY(formData.endDate as string);
      if (!sd || !ed) {
        Alert.alert('Thông báo', 'Ngày bắt đầu hoặc kết thúc không hợp lệ');
        return;
      }
      if (sd >= ed) {
        Alert.alert('Thông báo', 'Ngày bắt đầu phải trước ngày kết thúc');
        return;
      }
    }

    // normalize dates for storage
    if (formData.startDate && isValidDateDDMMYYYY(formData.startDate as string)) {
      formData.startDate = normalizeDateDDMMYYYY(formData.startDate as string);
    }
    if (formData.endDate && isValidDateDDMMYYYY(formData.endDate as string)) {
      formData.endDate = normalizeDateDDMMYYYY(formData.endDate as string);
    }

    const day = DAYS[selectedDayIndex];
    
    if (editingClass) {
      const prev = Object.values(scheduleData).flat().find(c => c.id === editingClass.id);
      const updated = { ...scheduleData };
      const dayClasses = updated[day];
      const index = dayClasses.findIndex(c => c.id === editingClass.id);
      if (index >= 0) {
        dayClasses[index] = { ...dayClasses[index], ...formData } as Class;
      }

      // update class
      const updatedClass = dayClasses[index];
      updatedClass.reminder = (formData.reminder as string) || 'off';
      setScheduleData(updated);
    } else {
      const newClass: Class = {
        id: Date.now().toString(),
        name: formData.name || '',
        teacher: formData.teacher || '',
        room: formData.room || '',
        startTime: formData.startTime || '',
        endTime: formData.endTime || '',
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        day: day,
        color: formData.color || '#FF6B6B',
        notes: formData.notes || '',
        reminder: (formData.reminder as string) || 'off',
      } as Class;

      const updated = { ...scheduleData };
      if (!updated[day]) updated[day] = [];
      updated[day].push(newClass);
      setScheduleData(updated);
    }

    setFormData({});
    setEditingClass(null);
    setShowClassModal(false);
  };

  const handleSaveNote = async () => {
    if (!noteFormData.title) {
      Alert.alert('Thông báo', 'Vui lòng nhập tiêu đề ghi chú');
      return;
    }

    // Normalize date format if provided and validate
    let normalizedDate = noteFormData.date || '';
    if (normalizedDate) {
      if (!isValidDateDDMMYYYY(normalizedDate)) {
        Alert.alert('Thông báo', 'Định dạng ngày không hợp lệ (DD/MM/YYYY)');
        return;
      }
      normalizedDate = normalizeDateDDMMYYYY(normalizedDate);
    }
    if (editingNote) {
      const updatedNotes = notes.map(n =>
        n.id === editingNote.id
          ? ({ ...n, ...noteFormData, date: normalizedDate, days: (noteFormData.days || []) } as Note)
          : n
      );
      setNotes(() => updatedNotes);
    } else {
      const newNote: Note = {
        id: Date.now().toString(),
        title: noteFormData.title || '',
        content: noteFormData.content || '',
        days: noteFormData.days || [],
        date: normalizedDate,
        reminder: (noteFormData.reminder as string) || 'off',
      };
      setNotes(prev => [...prev, newNote]);
    }

    setNoteFormData({});
    setEditingNote(null);
    setShowNoteModal(false);
  };

  const handleDeleteNote = (note: Note) => {
    Alert.alert('Xác nhận', 'Bạn có muốn xóa ghi chú này?', [
      { text: 'Hủy', onPress: () => {} },
      { text: 'Xóa', onPress: () => { setNotes(prev => prev.filter(n => n.id !== note.id)); } },
    ]);
  };

  const handleDeleteClass = (classItem: Class) => {
    Alert.alert('Xác nhận', 'Bạn có muốn xóa lớp học này?', [
      { text: 'Hủy', onPress: () => {} },
      {
        text: 'Xóa',
        onPress: () => {
          const day = classItem.day;
          const updated = { ...scheduleData };
          updated[day] = updated[day].filter(c => c.id !== classItem.id);
          setScheduleData(updated);
        },
      },
    ]);
  };

  const handleSaveExam = async () => {
    if (!examFormData.subject || !examFormData.date || !examFormData.time || !examFormData.room) {
      Alert.alert('Thông báo', 'Vui lòng điền đầy đủ thông tin');
      return;
    }

    // Validate date format
    if (!isValidDateDDMMYYYY(examFormData.date as string)) {
      Alert.alert('Thông báo', 'Định dạng ngày không hợp lệ (DD/MM/YYYY)');
      return;
    }
    // Normalize date to DD/MM/YYYY (leading zeros)
    const normalizedDate = normalizeDateDDMMYYYY(examFormData.date as string);

    // Validate time format
    if (!isValidTimeFormat(examFormData.time as string)) {
      Alert.alert('Thông báo', 'Thời gian không hợp lệ. Hãy nhập theo HH:MM');
      return;
    }

    if (editingExam) {
      const updatedExams = exams.map(e => 
        e.id === editingExam.id 
          ? { ...e, ...examFormData, date: normalizedDate } as Exam 
          : e
      );
      setExams(() => updatedExams);
    } else {
      const newExam: Exam = {
        id: Date.now().toString(),
        subject: examFormData.subject || '',
        date: normalizedDate,
        time: examFormData.time || '',
        room: examFormData.room || '',
        reminder: (examFormData.reminder as string) || 'off',
      };
      setExams(prev => [...prev, newExam]);
    }

    setExamFormData({});
    setEditingExam(null);
    setShowExamModal(false);
  };

  const handleDeleteExam = (exam: Exam) => {
    Alert.alert('Xác nhận', 'Bạn có muốn xóa lịch thi này?', [
      { text: 'Hủy', onPress: () => {} },
      {
        text: 'Xóa',
        onPress: () => {
          setExams(prev => prev.filter(e => e.id !== exam.id));
        },
      },
    ]);
  };

const exportScheduleToExcel = async () => {
  try {
    const worksheetData: any[] = [];

    worksheetData.push([
      'Thời Khóa Biểu',
      `Tuần từ ${formatDateVN(currentWeek)}`,
    ]);
    worksheetData.push([]);

    DAYS.forEach((day, index) => {
      worksheetData.push([DAYS_VI[index], formatDateVN(weekDates[index])]);

      // Classes
      worksheetData.push(['Môn học', 'Giáo viên', 'Phòng', 'Thời gian', 'Ghi chú']);
      const classes = scheduleData[day] || [];
      if (classes.length === 0) {
        worksheetData.push(['Không có lớp học', '', '', '', '']);
      } else {
        classes.forEach(cls => {
          worksheetData.push([
            cls.name,
            cls.teacher,
            cls.room,
            `${cls.startTime} - ${cls.endTime}`,
            cls.notes || '',
          ]);
        });
      }
      worksheetData.push([]);

      // Notes for that date/week
      const dayDateStr = formatDateVN(weekDates[index]);
      worksheetData.push(['Ghi chú', 'Nội dung', 'Ngày cụ thể']);
      const notesForDay = notes.filter(n => {
        if (n.date && n.date === dayDateStr) return true;
        if (n.days && n.days.includes(day)) return true;
        return false;
      });
      if (notesForDay.length === 0) {
        worksheetData.push(['Không có ghi chú', '', '']);
      } else {
        notesForDay.forEach(n => worksheetData.push([n.title, n.content || '', n.date || '']));
      }
      worksheetData.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    ws['!cols'] = [
      { wch: 25 },
      { wch: 40 },
      { wch: 15 },
      { wch: 20 },
      { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Thời Khóa Biểu');

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileName = `Thoi_khoa_bieu_${formatDateVN(currentWeek).replace(/\//g, '-')}.xlsx`;
    const fileUri = (FileSystem as any).documentDirectory + fileName;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
    await Sharing.shareAsync(fileUri);
    
  } catch (error) {
    console.error(error);
    Alert.alert('Lỗi', 'Không thể xuất file Excel');
  }
};

const exportExamsToExcel = async () => {
  try {
    const worksheetData: any[] = [];
    worksheetData.push(['Lịch Thi']);
    worksheetData.push([]);
    worksheetData.push(['Môn thi', 'Ngày', 'Thời gian', 'Phòng']);

    // sort exams by date then time
    const sorted = [...exams].sort((a, b) => {
      const da = parseDateFromDDMMYYYY(a.date) || new Date(0);
      const db = parseDateFromDDMMYYYY(b.date) || new Date(0);
      if (da.getTime() !== db.getTime()) return da.getTime() - db.getTime();
      return compareTimeStrings(a.time || '00:00', b.time || '00:00');
    });

    if (sorted.length === 0) {
      worksheetData.push(['Chưa có lịch thi', '', '', '']);
    } else {
      sorted.forEach(e => worksheetData.push([e.subject, e.date, e.time, e.room]));
    }

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lich_Thi');

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileName = `Lich_thi_${formatDateVN(new Date()).replace(/\//g, '-')}.xlsx`;
    const fileUri = (FileSystem as any).documentDirectory + fileName;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
    await Sharing.shareAsync(fileUri);
  } catch (error) {
    console.error(error);
    Alert.alert('Lỗi', 'Không thể xuất file Excel');
  }
};


  const currentDayClasses = getScheduleForDay(DAYS[selectedDayIndex]);
  const currentDate = weekDates[selectedDayIndex];
  const dateDisplay = `${DAYS_VI[selectedDayIndex]}, ${formatDateVN(currentDate)}`;
  // Exams for the currently selected date (match DD/MM/YYYY)
  const examsForCurrent = exams.filter(e => e.date === formatDateVN(currentDate));

  // Lấy danh sách 10 tuần để chọn
  const weekOptions = useMemo(() => {
    const options = [];
    for (let i = -2; i <= 7; i++) {
      const date = new Date(currentWeek);
      date.setDate(currentWeek.getDate() + i * 7);
      options.push({
        id: i.toString(),
        date: new Date(date),
        label: `${formatDateVN(date)} - ${formatDateVN(new Date(date.getTime() + 6 * 24 * 60 * 60 * 1000))}`,
      });
    }
    return options;
  }, [currentWeek]);

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.weekPickerButton}
              onPress={() => setShowWeekPicker(true)}
            >
              <Text style={styles.weekPickerButtonText}>📅</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.weekPickerButton}
              onPress={() => setShowExamList(true)}
            >
              <Text style={styles.weekPickerButtonText}>📝</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.weekPickerButton}
              onPress={() => setShowExportModal(true)}
            >
              <Text style={styles.weekPickerButtonText}>📊</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.dateDisplay}>{dateDisplay}</Text>
      </View>

      {/* Day Selector */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.daySelector}
        contentContainerStyle={styles.daySelectorContent}
      >
        {DAYS.map((day, index) => (
          <TouchableOpacity
            key={day}
            style={[
              styles.dayButton,
              selectedDayIndex === index && styles.dayButtonActive,
            ]}
            onPress={() => setSelectedDayIndex(index)}
          >
            <Text style={[
              styles.dayButtonText,
              selectedDayIndex === index && styles.dayButtonTextActive,
            ]}>
              {DAYS_VI[index]}
            </Text>
            <Text style={[
              styles.dayButtonDate,
              selectedDayIndex === index && styles.dayButtonDateActive,
            ]}>
              {weekDates[index].getDate()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Add Choice Button: choose add class or add note */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddChoiceModal(true)}
      >
        <Text style={styles.addButtonText}>+ Thêm</Text>
      </TouchableOpacity>

      {/* Add choice modal */}
      <Modal
        visible={showAddChoiceModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddChoiceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn hành động</Text>
              <TouchableOpacity onPress={() => setShowAddChoiceModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.addChoiceButton}
              onPress={() => {
                setShowAddChoiceModal(false);
                setEditingClass(null);
                setFormData({});
                setShowClassModal(true);
              }}
            >
              <Text style={styles.addChoiceButtonText}>+ Thêm môn học</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addChoiceButton, { backgroundColor: '#6BCB77' }]}
              onPress={() => {
                setShowAddChoiceModal(false);
                setEditingNote(null);
                setNoteFormData({ days: [DAYS[selectedDayIndex]] });
                setShowNoteModal(true);
              }}
            >
              <Text style={styles.addChoiceButtonText}>+ Thêm ghi chú</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Note Modal */}
      <Modal
        visible={showNoteModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowNoteModal(false);
          setEditingNote(null);
          setNoteFormData({});
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingNote ? 'Sửa ghi chú' : 'Thêm ghi chú'}</Text>
              <TouchableOpacity onPress={() => {
                setShowNoteModal(false);
                setEditingNote(null);
                setNoteFormData({});
              }}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.formLabel}>Tiêu đề</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Nhập tiêu đề"
                value={noteFormData.title || ''}
                onChangeText={(text) => setNoteFormData({ ...noteFormData, title: text })}
              />

              <Text style={styles.formLabel}>Nội dung</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Nhập nội dung"
                value={noteFormData.content || ''}
                onChangeText={(text) => setNoteFormData({ ...noteFormData, content: text })}
                multiline
              />

              <Text style={styles.formLabel}>Ngày cụ thể (DD/MM/YYYY) (tùy chọn)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="VD: 25/12/2025"
                value={noteFormData.date || ''}
                onChangeText={(text) => setNoteFormData({ ...noteFormData, date: text })}
              />

              <Text style={styles.formLabel}>Ngày trong tuần (chọn nhiều hoặc không chọn)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                {DAYS.map((d, idx) => {
                  const selectedDays = noteFormData.days || [];
                  const active = selectedDays.includes(d);
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dayButton, active && styles.dayButtonActive, { marginHorizontal: 6 }]}
                      onPress={() => {
                        const s = new Set(selectedDays);
                        if (s.has(d)) s.delete(d); else s.add(d);
                        setNoteFormData({ ...noteFormData, days: Array.from(s) });
                      }}
                    >
                      <Text style={[styles.dayButtonText, active && styles.dayButtonTextActive]}>{DAYS_VI[idx]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveNote}>
                  <Text style={styles.saveButtonText}>Lưu</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowNoteModal(false);
                    setEditingNote(null);
                    setNoteFormData({});
                  }}
                >
                  <Text style={styles.cancelButtonText}>Hủy</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Schedule List */}
      <ScrollView
        style={styles.scheduleContainer}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {currentDayClasses.length > 0 ? (
          currentDayClasses.map((classItem) => (
            <View key={classItem.id} style={styles.classCard}>
              <View 
                style={[
                  styles.classColorBar,
                  { backgroundColor: classItem.color }
                ]}
              />
              <View style={styles.classContent}>
                <View style={styles.classTimeRow}>
                  <Text style={styles.className}>{classItem.name}</Text>
                  <Text style={styles.classTime}>
                    {classItem.startTime} - {classItem.endTime}
                  </Text>
                </View>
                <Text style={styles.classTeacher}>Giáo viên: {classItem.teacher}</Text>
                <Text style={styles.classRoom}>Phòng: {classItem.room}</Text>
                {classItem.notes && <Text style={styles.classNotes}>Ghi chú: {classItem.notes}</Text>}
              </View>
              <View style={styles.classActions}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingClass(classItem);
                    setFormData(classItem);
                    setShowClassModal(true);
                  }}
                >
                  <Text style={styles.actionButton}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteClass(classItem)}>
                  <Text style={styles.actionButton}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Không có lớp học hôm nay</Text>
          </View>
        )}

        {/* Exams for the selected date */}
        {examsForCurrent.length > 0 && (
          <View style={{ marginTop: 8 }}>
            {examsForCurrent.map(exam => (
              <View key={exam.id} style={styles.examCard}>
                <View style={styles.examContent}>
                  <Text style={styles.examSubject}>{exam.subject}</Text>
                  <Text style={styles.examInfo}>Ngày: {exam.date}</Text>
                  <Text style={styles.examInfo}>Giờ: {exam.time}</Text>
                  <Text style={styles.examInfo}>Phòng: {exam.room}</Text>
                </View>
                <View style={styles.examActions}>
                  <TouchableOpacity onPress={() => { setEditingExam(exam); setExamFormData(exam); setShowExamModal(true); }}>
                    <Text style={styles.actionButton}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteExam(exam)}>
                    <Text style={styles.actionButton}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Notes for the day */}
        {notes.filter(n => (n.date && n.date === formatDateVN(currentDate)) || (n.days && n.days.includes(DAYS[selectedDayIndex])) ).length > 0 && (
          <View style={{ marginTop: 8 }}>
            {notes.filter(n => (n.date && n.date === formatDateVN(currentDate)) || (n.days && n.days.includes(DAYS[selectedDayIndex])) ).map(n => (
              <View key={n.id} style={styles.noteCard}>
                <View style={styles.noteContent}>
                  <Text style={styles.noteTitle}>{n.title}</Text>
                  <Text style={styles.noteBody}>{n.content}</Text>
                  {n.date ? <Text style={styles.noteDate}>Ngày: {n.date}</Text> : null}
                </View>
                <View style={styles.noteActions}>
                  <TouchableOpacity onPress={() => { setEditingNote(n); setNoteFormData(n); setShowNoteModal(true); }}>
                    <Text style={styles.actionButton}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteNote(n)}>
                    <Text style={styles.actionButton}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Week Picker Modal */}
      <Modal
        visible={showWeekPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowWeekPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn Tuần</Text>
              <TouchableOpacity onPress={() => setShowWeekPicker(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={weekOptions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.weekOption}
                  onPress={() => {
                    setCurrentWeek(getWeekStartDate(item.date));
                    setSelectedDayIndex(0);
                    setShowWeekPicker(false);
                  }}
                >
                  <View
                    style={[
                      styles.weekOptionDot,
                      currentWeek.getTime() === getWeekStartDate(item.date).getTime() &&
                        styles.weekOptionDotActive,
                    ]}
                  />
                  <Text style={styles.weekOptionText}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

            {/* Export Modal */}
            <Modal
              visible={showExportModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowExportModal(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { paddingBottom: 20 }]}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Xuất dữ liệu</Text>
                    <TouchableOpacity onPress={() => setShowExportModal(false)}>
                      <Text style={styles.modalCloseButton}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.addChoiceButton, { marginTop: 12 }]}
                    onPress={async () => {
                      setShowExportModal(false);
                      await exportScheduleToExcel();
                    }}
                  >
                    <Text style={styles.addChoiceButtonText}>Xuất Thời Khóa Biểu</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addChoiceButton, { backgroundColor: '#4ECDC4', marginTop: 12 }]}
                    onPress={async () => {
                      setShowExportModal(false);
                      await exportExamsToExcel();
                    }}
                  >
                    <Text style={styles.addChoiceButtonText}>Xuất Lịch Thi</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cancelButton, { margin: 20 }]}
                    onPress={() => setShowExportModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Hủy</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

      {/* Class Modal */}
      <Modal
        visible={showClassModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowClassModal(false);
          setEditingClass(null);
          setFormData({});
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingClass ? 'Sửa môn học' : 'Thêm môn học'}</Text>
              <TouchableOpacity onPress={() => {
                setShowClassModal(false);
                setEditingClass(null);
                setFormData({});
              }}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.formLabel}>Tên môn học</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Nhập tên môn học"
                value={formData.name || ''}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />

              <Text style={styles.formLabel}>Giáo viên</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Nhập tên giáo viên"
                value={formData.teacher || ''}
                onChangeText={(text) => setFormData({ ...formData, teacher: text })}
              />

              <Text style={styles.formLabel}>Phòng học</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Nhập phòng học"
                value={formData.room || ''}
                onChangeText={(text) => setFormData({ ...formData, room: text })}
              />

              <Text style={styles.formLabel}>Thời gian bắt đầu (HH:MM)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="VD: 07:00"
                value={formData.startTime || ''}
                onChangeText={(text) => setFormData({ ...formData, startTime: text })}
              />

              <Text style={styles.formLabel}>Ngày bắt đầu (DD/MM/YYYY) (tùy chọn)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="VD: 01/12/2025"
                value={formData.startDate || ''}
                onChangeText={(text) => setFormData({ ...formData, startDate: text })}
              />

              <Text style={styles.formLabel}>Thời gian kết thúc (HH:MM)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="VD: 08:30"
                value={formData.endTime || ''}
                onChangeText={(text) => setFormData({ ...formData, endTime: text })}
              />

              <Text style={styles.formLabel}>Ngày kết thúc (DD/MM/YYYY) (tùy chọn)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="VD: 31/12/2025"
                value={formData.endDate || ''}
                onChangeText={(text) => setFormData({ ...formData, endDate: text })}
              />

              <Text style={styles.formLabel}>Ghi chú (tùy chọn)</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Nhập ghi chú"
                value={formData.notes || ''}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                multiline
              />

              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveClass}>
                  <Text style={styles.saveButtonText}>Lưu</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowClassModal(false);
                    setEditingClass(null);
                    setFormData({});
                  }}
                >
                  <Text style={styles.cancelButtonText}>Hủy</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Exam Modal */}
      <Modal
        visible={showExamModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowExamModal(false);
          setEditingExam(null);
          setExamFormData({});
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingExam ? 'Sửa lịch thi' : 'Thêm lịch thi'}</Text>
              <TouchableOpacity onPress={() => {
                setShowExamModal(false);
                setEditingExam(null);
                setExamFormData({});
              }}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.formLabel}>Môn thi</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Nhập môn thi"
                value={examFormData.subject || ''}
                onChangeText={(text) => setExamFormData({ ...examFormData, subject: text })}
              />

              <Text style={styles.formLabel}>Ngày thi (DD/MM/YYYY)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="VD: 25/12/2025"
                value={examFormData.date || ''}
                onChangeText={(text) => setExamFormData({ ...examFormData, date: text })}
              />

              <Text style={styles.formLabel}>Thời gian (HH:MM)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="VD: 08:00"
                value={examFormData.time || ''}
                onChangeText={(text) => setExamFormData({ ...examFormData, time: text })}
              />

              <Text style={styles.formLabel}>Phòng thi</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Nhập phòng thi"
                value={examFormData.room || ''}
                onChangeText={(text) => setExamFormData({ ...examFormData, room: text })}
              />

              {/* <Text style={styles.formLabel}>Giáo viên coi thi (tùy chọn)</Text>
              { <TextInput
                style={styles.textInput}
                placeholder="Nhập tên giáo viên"
                value={examFormData.teacher || ''}
                onChangeText={(text) => setExamFormData({ ...examFormData, teacher: text })}
              /> } */}

              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveExam}>
                  <Text style={styles.saveButtonText}>Lưu</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowExamModal(false);
                    setEditingExam(null);
                    setExamFormData({});
                  }}
                >
                  <Text style={styles.cancelButtonText}>Hủy</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Exam List Modal */}
      <Modal
        visible={showExamList}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowExamList(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Lịch Thi</Text>
              <TouchableOpacity onPress={() => setShowExamList(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.addExamButton}
              onPress={() => {
                setEditingExam(null);
                setExamFormData({});
                setShowExamList(false);
                setShowExamModal(true);
              }}
            >
              <Text style={styles.addExamButtonText}>+ Thêm lịch thi</Text>
            </TouchableOpacity>

            <FlatList
              data={exams}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.examCard}>
                  <View style={styles.examContent}>
                    <Text style={styles.examSubject}>{item.subject}</Text>
                    <Text style={styles.examInfo}>Ngày: {item.date}</Text>
                    <Text style={styles.examInfo}>Giờ: {item.time}</Text>
                    <Text style={styles.examInfo}>Phòng: {item.room}</Text>
                    {/* {item.teacher && <Text style={styles.examInfo}>GV coi: {item.teacher}</Text>} */}
                  </View>
                  <View style={styles.examActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingExam(item);
                        setExamFormData(item);
                        setShowExamList(false);
                        setShowExamModal(true);
                      }}
                    >
                      <Text style={styles.actionButton}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteExam(item)}>
                      <Text style={styles.actionButton}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>Chưa có lịch thi</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    backgroundColor: '#2F3E3E',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 10,        
    elevation: 10,     
  },

  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    zIndex: 11,       
    elevation: 11,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#BDC3C7',
  },
  weekPickerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekPickerButtonText: {
    fontSize: 20,
  },
  dateDisplay: {
    fontSize: 16,
    color: '#95A5A6',
    fontWeight: '500',
  },
  daySelector: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EBED',
    
    maxHeight: 90,
    zIndex: 9,     
    elevation: 9,   
  },
  daySelectorContent: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 8,
  },
  dayButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
    minWidth: 55,
    alignItems: 'center',
  },
  dayButtonActive: {
    backgroundColor: '#2D3436',
  },
  dayButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  dayButtonTextActive: {
    color: '#fff',
  },
  dayButtonDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D3436',
    marginTop: 2,
  },
  dayButtonDateActive: {
    color: '#fff',
  },
  scheduleContainer: {
    flex: 1,
    padding: 16,
  },
  addButton: {
    backgroundColor: '#2D3436',
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  classCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  classColorBar: {
    width: 5,
  },
  classContent: {
    flex: 1,
    padding: 16,
  },
  classTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  className: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3436',
    flex: 1,
  },
  classTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF6B6B',
    marginLeft: 12,
  },
  classTeacher: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  classRoom: {
    fontSize: 13,
    color: '#999',
  },
  classNotes: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 6,
  },
  classActions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: 12,
    zIndex: 5,
    elevation: 5,
  },
  actionButton: {
    fontSize: 18,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EBED',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3436',
  },
  modalCloseButton: {
    fontSize: 24,
    color: '#999',
    fontWeight: '500',
  },
  weekOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  weekOptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E8EBED',
    marginRight: 12,
  },
  weekOptionDotActive: {
    backgroundColor: '#2D3436',
  },
  weekOptionText: {
    fontSize: 15,
    color: '#2D3436',
    fontWeight: '500',
  },
  formContainer: {
    padding: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E8EBED',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#F9F9F9',
  },
  textAreaInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 20,
  },
  addChoiceButton: {
    backgroundColor: '#2D3436',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 20,
    marginVertical: 10,
    alignItems: 'center',
  },
  addChoiceButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  noteCard: {
    backgroundColor: '#FFF7E6',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  noteContent: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 6,
  },
  noteBody: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  noteDate: {
    fontSize: 12,
    color: '#999',
  },
  noteActions: {
    marginLeft: 10,
    justifyContent: 'space-between',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#2D3436',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#E8EBED',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#2D3436',
    fontSize: 14,
    fontWeight: '600',
  },
  addExamButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 20,
    marginVertical: 12,
  },
  addExamButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  examCard: {
    backgroundColor: '#F9F9F9',
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  examContent: {
    flex: 1,
  },
  examSubject: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 4,
  },
  examInfo: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  examActions: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 12,
  },
});

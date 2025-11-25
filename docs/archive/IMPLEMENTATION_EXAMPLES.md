# Примеры реализации функций

## 1. Работа с Google Sheets как базой данных

### Настройка Google Apps Script API

```typescript
// src/services/googleSheets.ts
interface Equipment {
  id: string;
  name: string;
  type: string;
  specs: Record<string, any>;
  googleDriveUrl: string;
  qrCodeUrl: string;
  commissioningDate?: string;
  lastMaintenanceDate?: string;
  status: string;
}

const SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL';

export async function getAllEquipment(): Promise<Equipment[]> {
  const response = await fetch(`${SCRIPT_URL}?action=getAll`);
  return response.json();
}

export async function addEquipment(equipment: Omit<Equipment, 'id'>): Promise<Equipment> {
  const response = await fetch(`${SCRIPT_URL}?action=add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(equipment)
  });
  return response.json();
}

export async function updateEquipment(id: string, equipment: Partial<Equipment>): Promise<Equipment> {
  const response = await fetch(`${SCRIPT_URL}?action=update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...equipment })
  });
  return response.json();
}

export async function deleteEquipment(id: string): Promise<void> {
  await fetch(`${SCRIPT_URL}?action=delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
}
```

### Google Apps Script код для работы с данными

```javascript
// Code.gs для управления оборудованием
function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'getAll') {
    return ContentService.createTextOutput(
      JSON.stringify(getAllEquipment())
    ).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput('Invalid action');
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  
  switch(action) {
    case 'add':
      return ContentService.createTextOutput(
        JSON.stringify(addEquipment(data))
      ).setMimeType(ContentService.MimeType.JSON);
    case 'update':
      return ContentService.createTextOutput(
        JSON.stringify(updateEquipment(data))
      ).setMimeType(ContentService.MimeType.JSON);
    case 'delete':
      deleteEquipment(data.id);
      return ContentService.createTextOutput('OK');
    default:
      return ContentService.createTextOutput('Invalid action');
  }
}

function getAllEquipment() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('Оборудование');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  return data.slice(1).map(row => {
    const equipment = {};
    headers.forEach((header, index) => {
      equipment[header] = row[index];
    });
    return equipment;
  });
}

function addEquipment(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('Оборудование');
  
  const id = Utilities.getUuid();
  const row = [
    id,
    data.name,
    data.type,
    JSON.stringify(data.specs),
    data.googleDriveUrl,
    data.qrCodeUrl,
    data.commissioningDate || '',
    data.lastMaintenanceDate || '',
    data.status || 'active',
    new Date(),
    new Date()
  ];
  
  sheet.appendRow(row);
  return { id, ...data };
}
```

---

## 2. Создание папок в Google Drive

```typescript
// src/services/googleDrive.ts
import { google } from 'googleapis';

export async function createEquipmentFolder(
  equipmentName: string,
  parentFolderId?: string
): Promise<{ id: string; url: string }> {
  // Вызываем Google Apps Script функцию
  const response = await fetch(`${SCRIPT_URL}?action=createFolder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: equipmentName,
      parentId: parentFolderId
    })
  });
  
  return response.json();
}
```

### Google Apps Script для создания папок

```javascript
// Code.gs
function createFolder(data) {
  const drive = DriveApp;
  const parentFolder = data.parentId 
    ? drive.getFolderById(data.parentId)
    : drive.getRootFolder();
  
  const folder = parentFolder.createFolder(data.name);
  
  // Настраиваем доступ
  folder.setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );
  
  return {
    id: folder.getId(),
    url: folder.getUrl()
  };
}
```

---

## 3. Компонент для управления оборудованием

```typescript
// src/components/EquipmentForm.tsx
import React, { useState } from 'react';
import { addEquipment, createEquipmentFolder } from '../services/googleSheets';
import { generateQRCode } from '../services/qrCode';

interface EquipmentFormProps {
  onSuccess?: () => void;
}

const EquipmentForm: React.FC<EquipmentFormProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'filter',
    specs: {
      height: '',
      diameter: '',
      capacity: '',
      // ... другие характеристики
    }
  });
  
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // 1. Создаем папку в Google Drive
      const folder = await createEquipmentFolder(formData.name);
      
      // 2. Генерируем QR-код
      const qrCodeUrl = folder.url;
      
      // 3. Сохраняем оборудование в БД
      await addEquipment({
        name: formData.name,
        type: formData.type,
        specs: formData.specs,
        googleDriveUrl: folder.url,
        qrCodeUrl: qrCodeUrl,
        status: 'active'
      });
      
      onSuccess?.();
      alert('Оборудование успешно добавлено!');
    } catch (error) {
      console.error('Ошибка:', error);
      alert('Ошибка при добавлении оборудования');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Поля формы */}
      <button type="submit" disabled={loading}>
        {loading ? 'Сохранение...' : 'Добавить оборудование'}
      </button>
    </form>
  );
};
```

---

## 4. Список оборудования

```typescript
// src/components/EquipmentList.tsx
import React, { useEffect, useState } from 'react';
import { getAllEquipment } from '../services/googleSheets';
import { Equipment } from '../types/equipment';

const EquipmentList: React.FC = () => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    loadEquipment();
  }, []);
  
  const loadEquipment = async () => {
    try {
      const data = await getAllEquipment();
      setEquipment(data);
    } catch (error) {
      console.error('Ошибка загрузки:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const filteredEquipment = equipment.filter(eq =>
    eq.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (loading) return <div>Загрузка...</div>;
  
  return (
    <div>
      <input
        type="text"
        placeholder="Поиск оборудования..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      
      <div className="equipment-grid">
        {filteredEquipment.map(eq => (
          <EquipmentCard key={eq.id} equipment={eq} />
        ))}
      </div>
    </div>
  );
};
```

---

## 5. Генерация QR-кода для оборудования

```typescript
// src/services/qrCode.ts
import { QRCodeSVG } from 'qrcode.react';

export function generateQRCodeImage(url: string): Promise<string> {
  return new Promise((resolve) => {
    // Используем canvas для генерации изображения
    const canvas = document.createElement('canvas');
    const qr = new QRCodeSVG({
      value: url,
      size: 200,
      level: 'H'
    });
    
    // Конвертируем в base64
    const img = qr.toDataURL();
    resolve(img);
  });
}

export function generateQRCodeUrl(equipmentId: string): string {
  // Вариант 1: Прямая ссылка на Google Drive
  // return `https://drive.google.com/drive/folders/${folderId}`;
  
  // Вариант 2: Ссылка на страницу оборудования в приложении
  return `${window.location.origin}/equipment/${equipmentId}`;
  
  // Вариант 3: Ссылка на веб-приложение с параметром
  // return `https://your-app.com/equipment?id=${equipmentId}`;
}
```

---

## 6. Использование Firebase (альтернатива)

```typescript
// src/services/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  // Ваши настройки Firebase
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function addEquipmentToFirebase(equipment: Equipment) {
  const docRef = await addDoc(collection(db, 'equipment'), equipment);
  return docRef.id;
}

export async function getAllEquipmentFromFirebase(): Promise<Equipment[]> {
  const snapshot = await getDocs(collection(db, 'equipment'));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Equipment));
}
```

---

## 7. Маршрутизация с React Router

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import EquipmentPage from './pages/Equipment';
import AdminPanel from './pages/Admin';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/equipment/:id" element={<EquipmentPage />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 8. Обновленная структура типов

```typescript
// src/types/equipment.ts
export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  serialNumber?: string;
  specs: EquipmentSpecs;
  googleDriveFolderId: string;
  googleDriveUrl: string;
  qrCodeUrl: string;
  qrCodeImage?: string;
  commissioningDate?: string;
  lastMaintenanceDate?: string;
  status: EquipmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type EquipmentType = 
  | 'filter' 
  | 'pump' 
  | 'tank' 
  | 'valve' 
  | 'other';

export type EquipmentStatus = 
  | 'active' 
  | 'inactive' 
  | 'archived';

export interface EquipmentSpecs {
  // Базовые характеристики
  height?: string;
  diameter?: string;
  capacity?: string;
  // Дополнительные характеристики в зависимости от типа
  [key: string]: any;
}

export interface FilterSpecs extends EquipmentSpecs {
  filtrationArea?: string;
  filtrationSpeed?: string;
  fillingMaterial?: string;
  fillingVolume?: string;
}
```


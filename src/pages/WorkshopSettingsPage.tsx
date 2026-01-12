/**
 * Страница управления участками
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Workshop, WorkshopInput, getAllWorkshops, addWorkshop, updateWorkshop, deleteWorkshop } from '../services/api/supabaseWorkshopApi';
import { showError, showSuccess } from '../utils/toast';
import { ROUTES } from '../utils/routes';
import './WorkshopSettingsPage.css';

const WorkshopSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newWorkshop, setNewWorkshop] = useState<WorkshopInput>({ name: '', description: '' });
  const [editingWorkshop, setEditingWorkshop] = useState<WorkshopInput>({ name: '', description: '' });

  useEffect(() => {
    if (isAdmin) {
      loadWorkshops();
    }
  }, [isAdmin]);

  const loadWorkshops = async () => {
    try {
      setLoading(true);
      const data = await getAllWorkshops();
      setWorkshops(data);
    } catch (err: any) {
      showError(err.message || 'Ошибка при загрузке участков');
    } finally {
      setLoading(false);
    }
  };

  const handleAddWorkshop = async () => {
    if (!newWorkshop.name.trim()) {
      showError('Введите название участка');
      return;
    }

    try {
      const created = await addWorkshop(newWorkshop);
      setWorkshops([...workshops, created]);
      setNewWorkshop({ name: '', description: '' });
      showSuccess('Участок добавлен');
    } catch (err: any) {
      showError(err.message || 'Ошибка при добавлении участка');
    }
  };

  const handleStartEdit = (workshop: Workshop) => {
    setEditingId(workshop.id);
    setEditingWorkshop({
      name: workshop.name,
      description: workshop.description || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingWorkshop({ name: '', description: '' });
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingWorkshop.name.trim()) {
      showError('Название участка не может быть пустым');
      return;
    }

    try {
      const updated = await updateWorkshop(id, editingWorkshop);
      setWorkshops(workshops.map(w => w.id === id ? updated : w));
      setEditingId(null);
      setEditingWorkshop({ name: '', description: '' });
      showSuccess('Участок обновлен');
    } catch (err: any) {
      showError(err.message || 'Ошибка при обновлении участка');
    }
  };

  const handleDeleteWorkshop = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этот участок?')) {
      return;
    }

    try {
      await deleteWorkshop(id);
      setWorkshops(workshops.filter(w => w.id !== id));
      showSuccess('Участок удален');
    } catch (err: any) {
      showError(err.message || 'Ошибка при удалении участка');
    }
  };

  if (!isAdmin) {
    return (
      <div className="workshop-settings-page">
        <div className="error-message">Доступ запрещен. Только администраторы могут управлять участками.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="workshop-settings-page">
        <div className="loading-message">Загрузка участков...</div>
      </div>
    );
  }

  return (
    <div className="workshop-settings-page">
      <div className="page-header">
        <div className="page-header-top">
          <button
            onClick={() => navigate(ROUTES.HOME)}
            className="back-button"
            type="button"
            title="Вернуться в главное меню"
          >
            ← Назад
          </button>
          <div className="page-header-content">
            <h1>Управление участками</h1>
            <p>Добавление, редактирование и удаление участков предприятия</p>
          </div>
        </div>
      </div>

      {/* Форма добавления нового участка */}
      <div className="add-workshop-section">
        <h2>Добавить новый участок</h2>
        <div className="add-workshop-form">
          <div className="form-group">
            <label htmlFor="new-name">Название участка *</label>
            <input
              id="new-name"
              type="text"
              value={newWorkshop.name}
              onChange={(e) => setNewWorkshop({ ...newWorkshop, name: e.target.value })}
              placeholder="Например: водочный участок"
              onKeyPress={(e) => e.key === 'Enter' && handleAddWorkshop()}
            />
          </div>
          <div className="form-group">
            <label htmlFor="new-description">Описание (опционально)</label>
            <input
              id="new-description"
              type="text"
              value={newWorkshop.description}
              onChange={(e) => setNewWorkshop({ ...newWorkshop, description: e.target.value })}
              placeholder="Дополнительная информация об участке"
              onKeyPress={(e) => e.key === 'Enter' && handleAddWorkshop()}
            />
          </div>
          <button
            onClick={handleAddWorkshop}
            className="add-button"
            type="button"
          >
            + Добавить участок
          </button>
        </div>
      </div>

      {/* Список участков */}
      <div className="workshops-list-section">
        <h2>Список участков ({workshops.length})</h2>
        {workshops.length === 0 ? (
          <div className="empty-message">Участки не добавлены</div>
        ) : (
          <div className="workshops-table-container">
            <table className="workshops-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Описание</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {workshops.map(workshop => (
                  <tr key={workshop.id}>
                    {editingId === workshop.id ? (
                      <>
                        <td>
                          <input
                            type="text"
                            value={editingWorkshop.name}
                            onChange={(e) => setEditingWorkshop({ ...editingWorkshop, name: e.target.value })}
                            className="edit-input"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editingWorkshop.description}
                            onChange={(e) => setEditingWorkshop({ ...editingWorkshop, description: e.target.value })}
                            className="edit-input"
                          />
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              onClick={() => handleSaveEdit(workshop.id)}
                              className="save-button"
                              type="button"
                            >
                              ✓ Сохранить
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="cancel-button"
                              type="button"
                            >
                              ✕ Отмена
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{workshop.name}</td>
                        <td>{workshop.description || '—'}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              onClick={() => handleStartEdit(workshop)}
                              className="edit-button"
                              type="button"
                            >
                              ✏️ Редактировать
                            </button>
                            <button
                              onClick={() => handleDeleteWorkshop(workshop.id)}
                              className="delete-button"
                              type="button"
                            >
                              🗑️ Удалить
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkshopSettingsPage;

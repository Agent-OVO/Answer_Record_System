import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, ExerciseRecord, MaterialRecord, DailySummary, BaseRecord } from '../types';
import { generateId } from '../lib/utils';
import { differenceInDays } from 'date-fns';

interface AppContextType {
  currentUser: User | null;
  login: (username: string, remember: boolean) => boolean;
  logout: () => void;
  
  exercises: ExerciseRecord[];
  materials: MaterialRecord[];
  summaries: DailySummary[];
  
  addExercise: (data: Omit<ExerciseRecord, 'id' | 'userId' | 'createdAt'>) => void;
  updateExercise: (id: string, data: Partial<ExerciseRecord>) => void;
  deleteExercise: (id: string) => void; // Soft delete
  
  addMaterial: (data: Omit<MaterialRecord, 'id' | 'userId' | 'createdAt'>) => void;
  updateMaterial: (id: string, data: Partial<MaterialRecord>) => void;
  deleteMaterial: (id: string) => void; // Soft delete
  
  addSummary: (data: Omit<DailySummary, 'id' | 'userId' | 'createdAt'>) => void;
  updateSummary: (id: string, data: Partial<DailySummary>) => void;
  deleteSummary: (id: string) => void; // Soft delete

  restoreRecord: (type: 'exercises' | 'materials' | 'summaries', id: string) => void;
  hardDeleteRecord: (type: 'exercises' | 'materials' | 'summaries', id: string) => void;
  
  importData: (exercises: ExerciseRecord[], materials: MaterialRecord[], summaries: DailySummary[], mode: 'append' | 'overwrite') => void;
}

const mockUsers = [
  { username: 'admin', password: '123' },
  { username: 'test', password: '123' },
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('currentUser');
    if (saved) return JSON.parse(saved);
    const sessionSaved = sessionStorage.getItem('currentUser');
    if (sessionSaved) return JSON.parse(sessionSaved);
    return null;
  });

  const [exercises, setExercises] = useState<ExerciseRecord[]>(() => JSON.parse(localStorage.getItem('exercises') || '[]'));
  const [materials, setMaterials] = useState<MaterialRecord[]>(() => JSON.parse(localStorage.getItem('materials') || '[]'));
  const [summaries, setSummaries] = useState<DailySummary[]>(() => JSON.parse(localStorage.getItem('summaries') || '[]'));

  // Cleanup effect for 30-day trash
  useEffect(() => {
    const now = Date.now();
    const isExpired = (deletedAt?: number) => deletedAt && differenceInDays(now, deletedAt) > 30;
    
    setExercises(prev => prev.filter(r => !isExpired(r.deletedAt)));
    setMaterials(prev => prev.filter(r => !isExpired(r.deletedAt)));
    setSummaries(prev => prev.filter(r => !isExpired(r.deletedAt)));
  }, []);

  // Persistence
  useEffect(() => { localStorage.setItem('exercises', JSON.stringify(exercises)); }, [exercises]);
  useEffect(() => { localStorage.setItem('materials', JSON.stringify(materials)); }, [materials]);
  useEffect(() => { localStorage.setItem('summaries', JSON.stringify(summaries)); }, [summaries]);

  const login = (username: string, remember: boolean) => {
    const userFound = mockUsers.find(u => u.username === username);
    if (userFound) {
      const userObj = { id: username, username };
      setCurrentUser(userObj);
      if (remember) {
        localStorage.setItem('currentUser', JSON.stringify(userObj));
      } else {
        sessionStorage.setItem('currentUser', JSON.stringify(userObj));
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
  };

  const addExercise = (data: any) => {
    if (!currentUser) return;
    setExercises(prev => [{ ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() }, ...prev]);
  };
  const updateExercise = (id: string, data: any) => {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
  };
  const deleteExercise = (id: string) => {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, deletedAt: Date.now() } : e));
  };

  const addMaterial = (data: any) => {
    if (!currentUser) return;
    setMaterials(prev => [{ ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() }, ...prev]);
  };
  const updateMaterial = (id: string, data: any) => {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...data } : m));
  };
  const deleteMaterial = (id: string) => {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, deletedAt: Date.now() } : m));
  };

  const addSummary = (data: any) => {
    if (!currentUser) return;
    setSummaries(prev => [{ ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() }, ...prev]);
  };
  const updateSummary = (id: string, data: any) => {
    setSummaries(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  };
  const deleteSummary = (id: string) => {
    setSummaries(prev => prev.map(s => s.id === id ? { ...s, deletedAt: Date.now() } : s));
  };

  const restoreRecord = (type: string, id: string) => {
    if (type === 'exercises') setExercises(prev => prev.map(e => e.id === id ? { ...e, deletedAt: undefined } : e));
    if (type === 'materials') setMaterials(prev => prev.map(m => m.id === id ? { ...m, deletedAt: undefined } : m));
    if (type === 'summaries') setSummaries(prev => prev.map(s => s.id === id ? { ...s, deletedAt: undefined } : s));
  };

  const hardDeleteRecord = (type: string, id: string) => {
    if (type === 'exercises') setExercises(prev => prev.filter(e => e.id !== id));
    if (type === 'materials') setMaterials(prev => prev.filter(m => m.id !== id));
    if (type === 'summaries') setSummaries(prev => prev.filter(s => s.id !== id));
  };

  const importData = (newExers: ExerciseRecord[], newMats: MaterialRecord[], newSums: DailySummary[], mode: 'append' | 'overwrite') => {
    if (!currentUser) return;
    
    // Auto-assign to current user
    const prepData = <T extends BaseRecord>(data: T[]) => 
      data.map(d => ({ ...d, userId: currentUser.id, id: generateId(), createdAt: Date.now(), deletedAt: undefined }));

    if (mode === 'overwrite') {
      setExercises(prev => [...prev.filter(e => e.userId !== currentUser.id), ...prepData(newExers)]);
      setMaterials(prev => [...prev.filter(m => m.userId !== currentUser.id), ...prepData(newMats)]);
      setSummaries(prev => [...prev.filter(s => s.userId !== currentUser.id), ...prepData(newSums)]);
    } else {
      setExercises(prev => [...prepData(newExers), ...prev]);
      setMaterials(prev => [...prepData(newMats), ...prev]);
      setSummaries(prev => [...prepData(newSums), ...prev]);
    }
  };

  return (
    <AppContext.Provider value={{
      currentUser, login, logout,
      exercises, materials, summaries,
      addExercise, updateExercise, deleteExercise,
      addMaterial, updateMaterial, deleteMaterial,
      addSummary, updateSummary, deleteSummary,
      restoreRecord, hardDeleteRecord,
      importData
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}

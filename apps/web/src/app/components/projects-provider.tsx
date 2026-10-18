'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createProjectSchema, type Project } from '@org/shared';

// Persistencia temporal en localStorage hasta que exista API/DB para proyectos.
const STORAGE_KEY = 'billy:projects';
const CURRENT_KEY = 'billy:current-project';

type ProjectsContextValue = {
  ready: boolean;
  projects: Project[];
  current: Project | null;
  select: (id: string) => void;
  create: (name: string) => string | null; // devuelve mensaje de error o null
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

function newProject(name: string): Project {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  };
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    let stored: Project[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    } catch {
      stored = [];
    }
    if (!Array.isArray(stored) || stored.length === 0) {
      stored = [newProject('Mi negocio')];
    }
    const saved = localStorage.getItem(CURRENT_KEY);
    setProjects(stored);
    setCurrentId(stored.some((p) => p.id === saved) ? saved : stored[0].id);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    if (currentId) localStorage.setItem(CURRENT_KEY, currentId);
  }, [ready, projects, currentId]);

  const create = useCallback(
    (name: string) => {
      const parsed = createProjectSchema.safeParse({ name });
      if (!parsed.success) return 'Escribe un nombre (máx. 60 caracteres).';
      if (
        projects.some(
          (p) => p.name.toLowerCase() === parsed.data.name.toLowerCase(),
        )
      ) {
        return 'Ya existe un proyecto con ese nombre.';
      }
      const project = newProject(parsed.data.name);
      setProjects((prev) => [...prev, project]);
      setCurrentId(project.id);
      return null;
    },
    [projects],
  );

  const value = useMemo<ProjectsContextValue>(
    () => ({
      ready,
      projects,
      current: projects.find((p) => p.id === currentId) ?? null,
      select: setCurrentId,
      create,
    }),
    [ready, projects, currentId, create],
  );

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider');
  return ctx;
}

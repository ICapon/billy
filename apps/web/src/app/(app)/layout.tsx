import { ProjectsProvider } from '../components/projects-provider';
import { Sidebar } from '../components/sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProjectsProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
      </div>
    </ProjectsProvider>
  );
}

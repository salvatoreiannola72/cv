import Navbar from "./Navbar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <Navbar />
      <main className="min-h-screen">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardLayout from "@/layout/DashboardLayout";
import DashboardHome from "@/pages/DashboardHome";
import StudentsPage from "@/pages/StudentsPage";
import StudentDetailPage from "@/pages/StudentDetailPage";
import ClassesPage from "@/pages/ClassesPage";
import FeesPage from "@/pages/FeesPage";
import AttendancePage from "@/pages/AttendancePage";
import LandingPage from "@/pages/LandingPage";
import UsersPage from "@/pages/UsersPage";
import BillingPage from "@/pages/BillingPage";
import AccountPage from "@/pages/AccountPage";
import DiaryPage from "@/pages/DiaryPage";
import LettersPage from "@/pages/LettersPage";
import HolidaysPage from "@/pages/HolidaysPage";
import ManagementDashboard from "@/pages/ManagementDashboard";
import ClassDetailPage from "@/pages/ClassDetailPage";
import ProgressPage from "@/pages/ProgressPage";
import DayAttendancePage from "@/pages/DayAttendancePage";
import SubjectPage from "@/pages/SubjectPage";
import TransportPage from "@/pages/TransportPage";
import StaffPerformancePage from "@/pages/StaffPerformancePage";
import ParentHome from "@/pages/ParentHome";
import PlatformLoginPage from "@/pages/platform/PlatformLoginPage";
import PlatformPage from "@/pages/platform/PlatformPage";
import "@/App.css";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brand-paper">
        <div className="ui-card px-6 py-3 font-heading font-bold">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleOnly({ roles, children }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  return user?.role === "parent" ? <ParentHome /> : <DashboardHome />;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user === null) return null;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
          <Route path="/app" element={<Protected><DashboardLayout /></Protected>}>
            <Route index element={<Home />} />
            <Route path="diary" element={<RoleOnly roles={["teacher", "parent"]}><DiaryPage /></RoleOnly>} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="students/:id" element={<StudentDetailPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="classes/:id" element={<RoleOnly roles={["admin", "teacher"]}><ClassDetailPage /></RoleOnly>} />
            <Route path="fees" element={<RoleOnly roles={["admin", "parent"]}><FeesPage /></RoleOnly>} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="users" element={<RoleOnly roles={["admin"]}><UsersPage /></RoleOnly>} />
            <Route path="transport" element={<RoleOnly roles={["admin"]}><TransportPage /></RoleOnly>} />
            <Route path="attendance/day/:date" element={<RoleOnly roles={["admin", "teacher"]}><DayAttendancePage /></RoleOnly>} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="progress/subject/:sid/:subject" element={<SubjectPage />} />
            <Route path="staff" element={<RoleOnly roles={["admin"]}><StaffPerformancePage /></RoleOnly>} />
            <Route path="management" element={<RoleOnly roles={["admin"]}><ManagementDashboard /></RoleOnly>} />
            <Route path="holidays" element={<RoleOnly roles={["admin", "teacher"]}><HolidaysPage /></RoleOnly>} />
            <Route path="letters" element={<RoleOnly roles={["admin"]}><LettersPage /></RoleOnly>} />
            <Route path="billing" element={<RoleOnly roles={["admin"]}><BillingPage /></RoleOnly>} />
            <Route path="account" element={<AccountPage />} />
          </Route>
          <Route path="/platform/login" element={<PlatformLoginPage />} />
          <Route path="/platform" element={<PlatformPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

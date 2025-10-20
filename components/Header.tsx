import Link from "next/link"
import Image from "next/image"
import NavItems from "@/components/NavItems"
import UserDropDown from "./UserDropDown"
const Header = () => {
  return (
    <header className="sticky top-0 header">
      <div className="container header-wrapper">
        <Link href="/">
        <Image src="/assets/icons/logo.svg" alt="stocks logo" width={140} height={32} className="h-8 w-auto cursor-pointer"/>
        </Link>
        <nav className="hidden sm:block">
          <NavItems/>
        </nav>
        <UserDropDown/>
      </div>
    </header>
  )
}

export default Header
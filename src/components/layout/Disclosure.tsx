import type { ReactNode } from 'react'

export function Disclosure({inline=false,title,className,children}:{inline?:boolean;title:string;className?:string;children:ReactNode}) {
  return inline ? <section className={className}>{children}</section> : <details className={className}><summary>{title}</summary>{children}</details>
}

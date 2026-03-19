"use client"

import React from "react"
import { LucideIcon } from "lucide-react"

interface PageHeaderProps {
  title: string
  description?: string
  icon?: LucideIcon
}

export default function PageHeader({ title, description, icon: Icon }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1 pb-8">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-8 w-8 text-primary" />}
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      </div>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  )
}

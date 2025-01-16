'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Lightbulb, FileText, Code, Mic, ChevronDown } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Textarea } from '@/components/ui/textarea'

interface Role {
  id: string
  name: string
  icon: string
  color: string
}

const roles: Role[] = [
  { id: 'khoj', name: 'Khoj', icon: '💡', color: 'bg-orange-100 text-orange-700' },
  { id: 'legal', name: 'Legal', icon: '⚖️', color: 'bg-green-100 text-green-700' },
  { id: 'sage', name: 'Sage', icon: '🌿', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'therapist', name: 'Therapist', icon: '🎯', color: 'bg-blue-100 text-blue-700' },
  { id: 'teacher', name: 'Teacher', icon: '📚', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'health', name: 'Health', icon: '⚕️', color: 'bg-red-100 text-red-700' },
]

export default function ChatStart() {
  const [selectedRole, setSelectedRole] = useState('khoj')
  const [researchMode, setResearchMode] = useState(false)
  const [input, setInput] = useState('')

  return (
    <div className="text-neutral max-w-3xl mx-auto py-6 px-4 sm:py-12 sm:px-6 space-y-6 sm:space-y-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-12">
        What should we build?
      </h1>

      <div className="bg-neutral-100 backdrop-blur-sm rounded-xl shadow-lg border p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-wrap gap-2 sm:gap-3 justify-center">
          {roles.map((role) => (
            <Button
              key={role.id}
              variant={"outline"}
              className={`${selectedRole === role.id
                ? `${role.color} ring-2 ring-primary`
                : 'transition-colors'
                } gap-1 sm:gap-2 px-2 sm:px-4 py-1 sm:py-2 h-auto text-xs sm:text-sm`}
              onClick={() => setSelectedRole(role.id)}
            >
              <span>{role.icon}</span>
              {role.name}
            </Button>
          ))}
        </div>

        <div className="relative">
          <Textarea
            value={input}
            autoFocus={true}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type / to see a list of commands"
            className="pr-12 sm:pr-20 pl-3 sm:pl-4 text-sm sm:text-base bg-background focus-visible:ring-primary focus-visible:ring-2 transition-shadow overflow-scroll min-h-24 max-h-48"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant='ghost'
                  className="absolute right-2 top-2 transform transition-colors"
                >
                  <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Voice input</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size='sm'
                  onClick={() => setResearchMode(!researchMode)}
                  className="absolute right-2 bottom-2 flex items-center justify-end gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                  Research Mode
                  <Switch
                    checked={researchMode}
                    onCheckedChange={setResearchMode}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Iterate prompts with greater depth. Response times may increase.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3  text-sm sm:text-base">
          <Button
            variant="outline"
            className="flex items-center justify-start gap-2 py-2 sm:py-3 px-4 h-auto hover:shadow-sm transition-all"
          >
            <FileText className="h-4 w-4 flex-shrink-0" />
            Analyze document
          </Button>
          <Button
            variant="outline"
            className="flex items-center justify-start gap-2 py-2 sm:py-3 px-4 h-auto hover:shadow-sm transition-all"
          >
            <Code className="h-4 w-4 flex-shrink-0" />
            Write code
          </Button>
          <Button
            variant="outline"
            className="flex items-center justify-start gap-2 py-2 sm:py-3 px-4 h-auto hover:shadow-sm transition-all"
          >
            <Lightbulb className="h-4 w-4 flex-shrink-0" />
            Explain concept
          </Button>
        </div>

        <Button
          variant="ghost"
          className="w-full text-muted-foreground flex items-center justify-center gap-2 transition-colors py-3 sm:py-4 text-sm sm:text-base"
        >
          Show All
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}

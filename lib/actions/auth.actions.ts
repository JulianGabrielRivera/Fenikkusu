'use server'

import {auth} from "@/lib/better-auth/auth";
import { inngest } from "../inngest/client";
import { success } from "better-auth";
import { headers } from "next/headers";
export const signUpWithEmail = async({email,password,fullName,country,investmentGoals,riskTolerance,preferredIndustry}:SignUpFormData)=>{
    try{
        const response = await auth.api.signUpEmail({
            body:{email:email,password:password, name:fullName}
        })

        if(response){
            await inngest.send({
                name: 'app/user.created',
                data:{
                    email,
                    name:fullName,
                    country,
                    investmentGoals,
                    riskTolerance,
                    preferredIndustry
                }
            })
        }
        return {success:true, data:response}
    }
    catch(error){
        console.log('Sign up failed', error)
        return {success:false,error:'Sign up failed'}
    }
}

export const signOut = async() =>{
    try{
        await auth.api.signOut({
            headers: await headers()
        })

    }
    catch(e){
        console.log('Sign out failed', e)
        return {success:false, error:'Sign out failed'}
    }
}

export const signInWithEmail = async({email,password}:SignInFormData)=>{
    try{
        const response = await auth.api.signInEmail({
            body:{email:email,password:password }
        })
        return {success:true, data:response}
    }
    catch(error){
        console.log('Sign in failed', error)
        return {success:false,error:'Sign in failed'}
    }
}